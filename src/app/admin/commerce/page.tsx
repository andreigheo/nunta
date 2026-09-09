"use client";

import * as React from "react";
import { AlertTriangle, BadgeEuro, CreditCard, RefreshCw, ReceiptText } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardSkeleton, CardTitle, StatCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { apiErrorMessage, type PlatformCommerceResource, weddingOsApi } from "@/lib/api/client";

export default function CommercePage() {
  const [data, setData] = React.useState<PlatformCommerceResource | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await weddingOsApi.platformCommerce("30d")); }
    catch (caught) { setError(apiErrorMessage(caught)); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const volume = data?.volumeByCurrency.length
    ? data.volumeByCurrency
        .map((item) =>
          new Intl.NumberFormat("ro-RO", {
            style: "currency",
            currency: item.currency,
            maximumFractionDigits: 0,
          }).format(Number(item._sum.totalMinor ?? 0) / 100),
        )
        .join(" · ")
    : "0";
  return <AdminShell title="Comerț" subtitle="Abonamente, checkout-uri, tranzacții și evenimente de plată din baza platformei." actions={<Button size="sm" variant="outline" loading={loading} onClick={() => void load()}><RefreshCw className="size-4" />Actualizează</Button>}>
    {loading && !data ? <CardSkeleton lines={9} /> : error || !data ? <Card className="border-danger/25"><CardContent className="flex gap-3 p-5"><AlertTriangle className="size-5 text-danger" /><div><p className="font-semibold">Datele comerciale nu sunt disponibile</p><p className="mt-1 text-sm text-muted">{error}</p></div></CardContent></Card> : <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Rezumat comercial">
        <StatCard label="Volum brut, 30 zile" value={volume} hint="Separat pe fiecare monedă" icon={BadgeEuro} />
        <StatCard label="Tranzacții" value={data.transactions._count} hint="În intervalul selectat" icon={ReceiptText} />
        <StatCard label="Checkout-uri" value={data.checkouts.reduce((sum, item) => sum + item._count, 0)} hint="Toate stările" icon={CreditCard} />
        <StatCard label="Evenimente eșuate" value={data.failedEvents} hint="FAILED și DEAD_LETTER" icon={AlertTriangle} tone={data.failedEvents ? "danger" : "success"} />
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card><CardHeader><div><CardTitle>Distribuție abonamente</CardTitle><CardDescription>Plan și stare curentă per workspace.</CardDescription></div></CardHeader><CardContent className="space-y-2">{data.subscriptions.map((item) => <div key={`${item.planKey}-${item.status}`} className="flex min-h-11 items-center gap-3 rounded-lg bg-subtle px-3"><Badge variant={item.planKey === "PRO" ? "brand" : item.planKey === "PLUS" ? "info" : "neutral"}>{item.planKey}</Badge><span className="flex-1 text-sm text-muted">{item.status}</span><strong className="tabular-nums">{item._count}</strong></div>)}</CardContent></Card>
        <Card><CardHeader><div><CardTitle>Starea checkout-urilor</CardTitle><CardDescription>Conversia tehnică în ultimele 30 de zile.</CardDescription></div></CardHeader><CardContent className="space-y-2">{data.checkouts.length ? data.checkouts.map((item) => <div key={item.status} className="flex min-h-11 items-center gap-3 rounded-lg bg-subtle px-3"><Badge variant={/FAILED|EXPIRED/.test(item.status) ? "danger" : /COMPLETED/.test(item.status) ? "success" : "warning"}>{item.status}</Badge><span className="flex-1" /><strong className="tabular-nums">{item._count}</strong></div>) : <p className="rounded-lg bg-subtle p-4 text-sm text-muted">Nu există checkout-uri în interval.</p>}</CardContent></Card>
      </div>

      <Card><CardHeader><div><CardTitle>Tranzacții recente</CardTitle><CardDescription>Ultimele înregistrări persistate, fără date sensibile ale cardului.</CardDescription></div></CardHeader><CardContent>{data.recentTransactions.length ? <Table minWidth="780px"><THead><TR><TH>Workspace</TH><TH>Plan</TH><TH>Stare</TH><TH>Factură</TH><TH>Dată</TH><TH align="right">Total</TH></TR></THead><TBody>{data.recentTransactions.map((item) => { const row = item as Record<string, unknown>; const workspace = row.workspace as Record<string, unknown> | undefined; return <TR key={item.id}><TD>{String(workspace?.title ?? row.workspaceId ?? "Workspace")}</TD><TD><Badge variant="neutral">{String(row.planKey ?? "-")}</Badge></TD><TD><Badge variant={/FAILED|REFUND/.test(String(row.status)) ? "danger" : "success"}>{String(row.status ?? "-")}</Badge></TD><TD>{String(row.invoiceNumber ?? "-")}</TD><TD>{new Date(String(row.createdAt)).toLocaleDateString("ro-RO")}</TD><TD align="right">{new Intl.NumberFormat("ro-RO", { style: "currency", currency: String(row.currency ?? "RON") }).format(Number(row.totalMinor ?? 0) / 100)}</TD></TR>; })}</TBody></Table> : <p className="rounded-lg bg-subtle p-4 text-sm text-muted">Nu există tranzacții în interval.</p>}</CardContent></Card>
    </div>}
  </AdminShell>;
}
