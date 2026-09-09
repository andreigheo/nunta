"use client";

import * as React from "react";
import {
  CalendarClock,
  CheckCircle2,
  Download,
  Plus,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { formatRON } from "@/lib/utils";
import {
  apiErrorMessage,
  weddingOsApi,
  type OperationResource,
} from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import { useDeferredLoad } from "@/lib/hooks/use-deferred-load";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardSkeleton,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Table,
  Textarea,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useToast,
} from "@/components/ui";

export default function PaymentsPage() {
  const { currentWorkspace, bootstrap, demoMode, loading } = useWorkspace();
  const { toast } = useToast();
  const [schedules, setSchedules] = React.useState<OperationResource[]>([]);
  const [payments, setPayments] = React.useState<OperationResource[]>([]);
  const [items, setItems] = React.useState<OperationResource[]>([]);
  const [mode, setMode] = React.useState<"schedule" | "payment" | null>(null);
  const [form, setForm] = React.useState<Record<string, string>>({});
  const [dataLoading, setDataLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState("");
  const currency = bootstrap?.workspace.currency ?? "RON";
  const load = React.useCallback(async () => {
    if (!currentWorkspace) {
      if (!loading) setDataLoading(false);
      return;
    }
    setDataLoading(true);
    setLoadError("");
    if (demoMode) {
      setItems([]);
      setSchedules([]);
      setPayments([]);
      setDataLoading(false);
      return;
    }
    try {
      const [scheduleRows, paymentRows, budget] = await Promise.all([
        weddingOsApi.paymentSchedules(currentWorkspace.id),
        weddingOsApi.commercialPayments(currentWorkspace.id),
        weddingOsApi.budget(currentWorkspace.id),
      ]);
      setSchedules(scheduleRows.items);
      setPayments(paymentRows.items);
      setItems(
        Array.isArray(budget.items)
          ? (budget.items as OperationResource[])
          : [],
      );
    } catch (error) {
      const message = apiErrorMessage(error);
      setLoadError(message);
      toast({
        title: "Plățile nu au putut fi încărcate",
        description: message,
        variant: "error",
      });
    } finally {
      setDataLoading(false);
    }
  }, [currentWorkspace, demoMode, loading, toast]);
  useDeferredLoad(load);
  const save = async () => {
    if (!currentWorkspace || !mode) return;
    if (demoMode) {
      toast({
        title: "Evidență demo salvată local",
        description: "Sarbato nu a procesat bani și nu a trimis mutații API.",
        variant: "info",
      });
      setMode(null);
      return;
    }
    try {
      if (mode === "schedule")
        await weddingOsApi.createPaymentSchedule(currentWorkspace.id, {
          budgetItemId: form.itemId,
          name: form.name,
          amountMinor: minor(form.amount),
          dueAt: new Date(`${form.dueAt}T12:00:00.000Z`).toISOString(),
          sequence: Number(form.sequence || 1),
          notes: form.notes || null,
        });
      else
        await weddingOsApi.createCommercialPayment(currentWorkspace.id, {
          paymentScheduleEntryId: form.scheduleId || null,
          budgetItemId: form.itemId,
          amountMinor: minor(form.amount),
          paidAt: new Date(
            form.paidAt || new Date().toISOString(),
          ).toISOString(),
          method: form.method || "BANK_TRANSFER",
          reference: form.reference || null,
          notesPrivate: form.notes || null,
        });
      setMode(null);
      setForm({});
      await load();
      toast({
        title:
          mode === "payment"
            ? "Plată externă înregistrată"
            : "Scadență programată",
        description:
          mode === "payment"
            ? "Sarbato a actualizat evidența. Nu a procesat bani și nu pretinde că a executat plata."
            : "Reminderul asincron este versionat și devine no-op dacă scadența se schimbă.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Înregistrarea nu a fost salvată",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  };
  const transition = async (payment: OperationResource, action: string) => {
    if (!currentWorkspace) return;
    if (demoMode) {
      toast({ title: "Stare demo actualizată local", variant: "info" });
      return;
    }
    try {
      await weddingOsApi.transitionCommercialPayment(
        currentWorkspace.id,
        payment.id,
        payment.version,
        action,
      );
      await load();
      toast({
        title:
          action === "REVERSE"
            ? "Anulare contabilă înregistrată"
            : "Evidența plății a fost actualizată",
        description:
          action === "REVERSE"
            ? "Plata confirmată a rămas neschimbată; Sarbato a adăugat o înregistrare compensatorie."
            : undefined,
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Starea nu a fost actualizată",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  };
  const exportSchedule = async () => {
    if (!currentWorkspace) return;
    if (demoMode) {
      toast({ title: "Export indisponibil în demo", variant: "info" });
      return;
    }
    try {
      const result = await weddingOsApi.commercialExport(currentWorkspace.id, {
        type: "payment_schedule",
        format: "xlsx",
      });
      toast({
        title: "Export pus în coadă",
        description: `Job ${result.job.id.slice(0, 8)} generează XLSX-ul.`,
        variant: "info",
      });
    } catch (error) {
      toast({
        title: "Exportul nu a pornit",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  };
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader
        title="Evidența plăților"
        description="Scadențe și plăți externe, urmărite clar lângă bugetul evenimentului."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void exportSchedule()}
            >
              <Download className="size-4" />
              Export XLSX
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMode("schedule")}
              disabled={!items.length}
            >
              <CalendarClock className="size-4" />
              Scadență
            </Button>
            <Button
              size="sm"
              onClick={() => setMode("payment")}
              disabled={!items.length}
            >
              <Plus className="size-4" />
              Înregistrează plată externă
            </Button>
          </>
        }
      />
      <Card className="overflow-hidden border-brand/20">
        <CardContent className="flex gap-3 p-5 text-sm leading-6 text-muted">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
            <ShieldCheck className="size-5" aria-hidden />
          </span>
          <p>
            <strong className="text-ink">Sarbato ține evidența.</strong> Plata
            se face direct între tine și furnizor, în afara platformei. Nu
            încasăm, nu transferăm și nu intermediem banii evenimentului.
          </p>
        </CardContent>
      </Card>
      {loading || dataLoading ? (
        <div className="grid gap-3 md:grid-cols-2">
          <CardSkeleton lines={5} />
          <CardSkeleton lines={5} />
        </div>
      ) : loadError ? (
        <ErrorState
          title="Evidența plăților nu este disponibilă"
          description={loadError}
          onRetry={() => void load()}
        />
      ) : !items.length ? (
        <EmptyState
          icon={ReceiptText}
          title="Bugetul nu are poziții"
          description="Configurează bugetul sau acceptă o ofertă înainte de a programa ori înregistra plăți."
          action={{
            label: "Deschide bugetul",
            onClick: () => window.location.assign("/budget"),
          }}
        />
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <Table minWidth="640px">
                <THead>
                  <TR>
                    <TH>Scadență</TH>
                    <TH>Data</TH>
                    <TH>Stare</TH>
                    <TH align="right">Sumă</TH>
                    <TH align="right">Plătit</TH>
                  </TR>
                </THead>
                <TBody>
                  {schedules.map((entry) => (
                    <TR key={entry.id}>
                      <TD className="font-medium">{String(entry.name)}</TD>
                      <TD>
                        {new Date(String(entry.dueAt)).toLocaleDateString(
                          "ro-RO",
                        )}
                      </TD>
                      <TD>
                        <Badge
                          variant={
                            entry.status === "PAID"
                              ? "success"
                              : entry.status === "OVERDUE"
                                ? "danger"
                                : "warning"
                          }
                        >
                          {label(String(entry.status))}
                        </Badge>
                      </TD>
                      <TD align="right">
                        {formatRON(Number(entry.amountMinor ?? 0) / 100)}
                      </TD>
                      <TD align="right">
                        {formatRON(Number(entry.paidMinor ?? 0) / 100)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-0">
              <Table minWidth="760px">
                <THead>
                  <TR>
                    <TH>Registru financiar</TH>
                    <TH>Metodă</TH>
                    <TH>Tip / stare</TH>
                    <TH align="right">Sumă</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {payments.map((payment) => {
                    const entryType = String(payment.entryType ?? "PAYMENT");
                    const adjustment = entryType !== "PAYMENT";
                    return (
                      <TR key={payment.id}>
                        <TD>
                          <p className="font-medium">
                            {String(payment.reference ?? "Fără referință")}
                          </p>
                          <p className="text-xs text-faint">
                            {new Date(String(payment.paidAt)).toLocaleString(
                              "ro-RO",
                            )}
                            {payment.originalPaymentId
                              ? ` · ajustează ${String(payment.originalPaymentId).slice(0, 8)}`
                              : ""}
                          </p>
                        </TD>
                        <TD>{label(String(payment.method))}</TD>
                        <TD>
                          <div className="flex flex-wrap gap-1">
                            <Badge
                              variant={
                                adjustment
                                  ? "neutral"
                                  : payment.status === "CONFIRMED"
                                    ? "success"
                                    : "brand"
                              }
                            >
                              {label(entryType)}
                            </Badge>
                            <Badge variant="outline">
                              {label(String(payment.status))}
                            </Badge>
                          </div>
                        </TD>
                        <TD
                          align="right"
                          className={adjustment ? "text-danger" : undefined}
                        >
                          {adjustment ? "−" : ""}
                          {formatRON(
                            Math.abs(Number(payment.amountMinor ?? 0)) / 100,
                          )}
                        </TD>
                        <TD>
                          <div className="flex gap-1">
                            {entryType === "PAYMENT" &&
                            payment.status === "RECORDED" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  void transition(payment, "CONFIRM")
                                }
                              >
                                <CheckCircle2 className="size-4" />
                                Confirmă evidența
                              </Button>
                            ) : null}
                            {entryType === "PAYMENT" &&
                            payment.status === "CONFIRMED" &&
                            payment.sourceType !== "ONLINE_PAYMENT" ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  void transition(payment, "REVERSE")
                                }
                              >
                                <RotateCcw className="size-4" />
                                Înregistrează anulare
                              </Button>
                            ) : null}
                          </div>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
      <Modal
        open={Boolean(mode)}
        onClose={() => {
          setMode(null);
          setForm({});
        }}
        title={
          mode === "schedule" ? "Scadență nouă" : "Înregistrează plată externă"
        }
        description={
          mode === "payment"
            ? "Această acțiune actualizează doar evidența Sarbato."
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setMode(null)}>
              Renunță
            </Button>
            <Button onClick={() => void save()}>Salvează</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Poziție buget">
            <Select
              value={form.itemId ?? ""}
              onChange={(event) =>
                setForm({ ...form, itemId: event.target.value })
              }
            >
              <option value="">Selectează</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {String(item.name)}
                </option>
              ))}
            </Select>
          </Field>
          {mode === "schedule" ? (
            <>
              <Field label="Denumire">
                <Input
                  value={form.name ?? ""}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                />
              </Field>
              <Field label="Data scadenței">
                <Input
                  type="date"
                  value={form.dueAt ?? ""}
                  onChange={(event) =>
                    setForm({ ...form, dueAt: event.target.value })
                  }
                />
              </Field>
              <Field label="Secvență">
                <Input
                  inputMode="numeric"
                  value={form.sequence ?? "1"}
                  onChange={(event) =>
                    setForm({ ...form, sequence: event.target.value })
                  }
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Scadență asociată">
                <Select
                  value={form.scheduleId ?? ""}
                  onChange={(event) => {
                    const schedule = schedules.find(
                      (entry) => entry.id === event.target.value,
                    );
                    setForm({
                      ...form,
                      scheduleId: event.target.value,
                      itemId: String(
                        schedule?.budgetItemId ?? form.itemId ?? "",
                      ),
                      amount: schedule
                        ? String(Number(schedule.amountMinor ?? 0) / 100)
                        : form.amount,
                    });
                  }}
                >
                  <option value="">Fără asociere</option>
                  {schedules.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {String(entry.name)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Metodă">
                <Select
                  value={form.method ?? "BANK_TRANSFER"}
                  onChange={(event) =>
                    setForm({ ...form, method: event.target.value })
                  }
                >
                  {[
                    "BANK_TRANSFER",
                    "CARD_EXTERNAL",
                    "CASH",
                    "CHECK",
                    "OTHER",
                  ].map((method) => (
                    <option key={method}>{method}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Momentul plății">
                <Input
                  type="datetime-local"
                  value={form.paidAt ?? ""}
                  onChange={(event) =>
                    setForm({ ...form, paidAt: event.target.value })
                  }
                />
              </Field>
              <Field label="Referință">
                <Input
                  value={form.reference ?? ""}
                  onChange={(event) =>
                    setForm({ ...form, reference: event.target.value })
                  }
                />
              </Field>
            </>
          )}
          <Field label={`Sumă (${currency})`}>
            <Input
              inputMode="decimal"
              value={form.amount ?? ""}
              onChange={(event) =>
                setForm({ ...form, amount: event.target.value })
              }
            />
          </Field>
          <Field label="Notiță privată">
            <Textarea
              value={form.notes ?? ""}
              onChange={(event) =>
                setForm({ ...form, notes: event.target.value })
              }
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
function minor(value?: string) {
  return Math.max(0, Math.round(Number(value || 0) * 100));
}
function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}
