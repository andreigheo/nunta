"use client";

import * as React from "react";
import { AlertTriangle, BarChart3, RefreshCw } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Badge, BarList, Button, Card, CardContent, CardDescription, CardHeader, CardSkeleton, CardTitle } from "@/components/ui";
import { apiErrorMessage, type PlatformTrafficResource, weddingOsApi } from "@/lib/api/client";

type Range = "7d" | "30d" | "90d";

export default function TrafficPage() {
  const [range, setRange] = React.useState<Range>("30d");
  const [data, setData] = React.useState<PlatformTrafficResource | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setData(await weddingOsApi.platformTraffic(range)); }
    catch (caught) { setError(apiErrorMessage(caught)); }
    finally { setLoading(false); }
  }, [range]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return <AdminShell title="Trafic și conversii" subtitle="Funnel intern verificabil și starea integrării de analytics. Datele externe nu sunt estimate." actions={<><div className="inline-flex rounded-lg border border-line bg-surface p-1">{(["7d", "30d", "90d"] as const).map((item) => <button type="button" key={item} aria-pressed={range === item} onClick={() => setRange(item)} className={`min-h-9 rounded-md px-3 text-xs font-semibold ${range === item ? "bg-brand text-on-brand" : "text-muted hover:bg-subtle"}`}>{item}</button>)}</div><Button size="sm" variant="outline" loading={loading} onClick={() => void load()}><RefreshCw className="size-4" />Actualizează</Button></>}>
    {loading && !data ? <CardSkeleton lines={8} /> : error || !data ? <ErrorPanel message={error ?? "Date indisponibile."} retry={load} /> : <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,.65fr)]">
      <Card><CardHeader><div><CardTitle>Funnel first-party</CardTitle><CardDescription>Evenimente persistate în baza Sarbato în intervalul selectat.</CardDescription></div></CardHeader><CardContent><BarList items={data.firstPartyFunnel.map((item, index) => ({ label: item.label, value: item.value, formatted: item.value.toLocaleString("ro-RO"), tone: index % 3 === 1 ? "accent" : index % 3 === 2 ? "sage" : "brand" }))} /></CardContent></Card>
      <Card><CardHeader><div><CardTitle>Google Analytics 4</CardTitle><CardDescription>Acces server-side pentru raportare administrativă.</CardDescription></div><BarChart3 className="size-5 text-faint" /></CardHeader><CardContent><Badge variant={data.analytics.status === "CONNECTED" ? "success" : "warning"}>{data.analytics.status === "CONNECTED" ? "Conectat" : "Neconectat"}</Badge><p className="mt-4 text-sm leading-6 text-muted">{data.analytics.detail}</p><p className="mt-4 rounded-lg bg-subtle p-3 text-xs leading-5 text-faint">Tag-ul din browser și accesul de citire prin GA4 Data API sunt două configurații diferite. Această pagină nu afișează cifre Google până când API-ul nu este autorizat.</p></CardContent></Card>
    </div>}
  </AdminShell>;
}

function ErrorPanel({ message, retry }: { message: string; retry: () => Promise<void> }) {
  return <Card className="border-danger/25"><CardContent className="flex gap-3 p-5"><AlertTriangle className="size-5 text-danger" /><div><p className="font-semibold">Raportul nu a putut fi încărcat</p><p className="mt-1 text-sm text-muted">{message}</p><Button className="mt-4" size="sm" variant="outline" onClick={() => void retry()}>Reîncearcă</Button></div></CardContent></Card>;
}
