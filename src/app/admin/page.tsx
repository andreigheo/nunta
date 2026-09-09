"use client";

import * as React from "react";
import Link from "next/link";
import { Activity, AlertTriangle, Building2, CircleCheck, RefreshCw, ShieldAlert, Users } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardSkeleton, CardTitle, Sparkline, StatCard } from "@/components/ui";
import { apiErrorMessage, type PlatformOverviewResource, type PlatformSystemStatusResource, weddingOsApi } from "@/lib/api/client";

type Range = "7d" | "30d" | "90d";
const rangeLabels: Record<Range, string> = { "7d": "7 zile", "30d": "30 zile", "90d": "90 zile" };

export default function AdminPage() {
  const [range, setRange] = React.useState<Range>("30d");
  const [overview, setOverview] = React.useState<PlatformOverviewResource | null>(null);
  const [system, setSystem] = React.useState<PlatformSystemStatusResource | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewResult, statusResult] = await Promise.all([
        weddingOsApi.platformOverview(range),
        weddingOsApi.platformSystemStatus(),
      ]);
      setOverview(overviewResult);
      setSystem(statusResult);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [range]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const rangeControl = (
    <div className="inline-flex rounded-lg border border-line bg-surface p-1" aria-label="Interval analizat">
      {(Object.keys(rangeLabels) as Range[]).map((value) => (
        <button key={value} type="button" aria-pressed={range === value} onClick={() => setRange(value)} className={`min-h-9 rounded-md px-3 text-xs font-semibold transition-colors ${range === value ? "bg-brand text-on-brand" : "text-muted hover:bg-subtle hover:text-ink"}`}>
          {rangeLabels[value]}
        </button>
      ))}
    </div>
  );

  return (
    <AdminShell title="Centru de comandă" subtitle="Starea platformei, prioritățile operaționale și activitatea administrativă, pe date persistente." actions={<>{rangeControl}<Button variant="outline" size="sm" loading={loading} onClick={() => void load()}><RefreshCw className="size-4" /> Actualizează</Button></>}>
      {loading && !overview ? <CardSkeleton lines={10} /> : error || !overview || !system ? (
        <Card className="border-danger/25"><CardContent className="flex items-start gap-3 p-5"><AlertTriangle className="mt-0.5 size-5 text-danger" /><div><p className="font-semibold">Datele administrative nu sunt disponibile</p><p className="mt-1 text-sm text-muted">{error ?? "Răspuns incomplet de la API."}</p><Button className="mt-4" size="sm" variant="outline" onClick={() => void load()}>Reîncearcă</Button></div></CardContent></Card>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2"><Badge variant={system.status === "OPERATIONAL" ? "success" : "warning"} dot>{system.status === "OPERATIONAL" ? "Platformă operațională" : "Platformă degradată"}</Badge><Badge variant="neutral">{system.environment}</Badge><span className="text-xs text-faint">Actualizat {new Date(overview.generatedAt).toLocaleString("ro-RO")}</span></div>

          <section aria-label="Indicatori principali" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Utilizatori" value={overview.counts.users} hint={`${overview.counts.activeUsers} activi`} icon={Users} href="/admin/users" />
            <StatCard label="Evenimente" value={overview.counts.workspaces} hint={`${overview.counts.activeWorkspaces} active`} icon={Activity} href="/admin/workspaces" />
            <StatCard label="Furnizori" value={overview.counts.vendors} hint="Organizații înregistrate" icon={Building2} href="/admin/vendors" />
            <StatCard label="Necesită atenție" value={overview.counts.supportOpen + overview.counts.incidentsOpen + overview.counts.alertsOpen} hint="Suport, incidente și alerte deschise" icon={ShieldAlert} tone={overview.counts.alertsOpen + overview.counts.incidentsOpen ? "danger" : "default"} href="/admin/incidents" />
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,.6fr)]">
            <Card><CardHeader><div><CardTitle>Ritm platformă</CardTitle><CardDescription>Conturi și evenimente noi în ultimele {rangeLabels[range]}.</CardDescription></div></CardHeader><CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <TrendSummary label="Conturi create" value={overview.trend.reduce((sum, item) => sum + item.users, 0)} points={overview.trend.map((item) => item.users)} />
                <TrendSummary label="Evenimente create" value={overview.trend.reduce((sum, item) => sum + item.workspaces, 0)} points={overview.trend.map((item) => item.workspaces)} />
              </div>
              <div className="mt-5 flex h-32 items-end gap-1" aria-label="Distribuție zilnică a activității">
                {overview.trend.map((item) => { const max = Math.max(...overview.trend.map((entry) => entry.users + entry.workspaces), 1); const value = item.users + item.workspaces; return <div key={item.date} className="group relative flex h-full min-w-0 flex-1 items-end"><div className="w-full rounded-t-sm bg-brand/75 transition-colors group-hover:bg-brand" style={{ height: `${Math.max(4, (value / max) * 100)}%` }} /><span className="sr-only">{item.date}: {value} înregistrări</span></div>; })}
              </div>
            </CardContent></Card>

            <Card><CardHeader><div><CardTitle>Priorități</CardTitle><CardDescription>Semnale reale care pot necesita intervenție.</CardDescription></div></CardHeader><CardContent className="space-y-2">
              <Priority href="/admin/support" label="Cazuri de suport" value={overview.counts.supportOpen} />
              <Priority href="/admin/incidents" label="Incidente deschise" value={overview.counts.incidentsOpen} critical />
              <Priority href="/admin/security" label="Alerte de securitate" value={overview.counts.alertsOpen} critical />
              <Priority href="/admin/operations" label="Joburi eșuate" value={overview.counts.failedJobs} />
              <Priority href="/admin/commerce" label="Evenimente billing dead-letter" value={overview.counts.deadBillingEvents} critical />
            </CardContent></Card>
          </section>

          <Card><CardHeader><div><CardTitle>Activitate administrativă recentă</CardTitle><CardDescription>Acțiuni mutate cu motiv și context de audit.</CardDescription></div><Link href="/admin/audit" className="text-xs font-semibold text-brand hover:underline">Vezi auditul</Link></CardHeader><CardContent>
            {!overview.recentActions.length ? <p className="rounded-lg bg-subtle p-4 text-sm text-muted">Nu există acțiuni administrative înregistrate în acest mediu.</p> : <ul className="divide-y divide-line">{overview.recentActions.map((item) => { const row = item as Record<string, unknown>; return <li key={item.id} className="grid gap-1 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="min-w-0"><p className="truncate font-medium">{String(row.action ?? "Acțiune administrativă")}</p><p className="truncate text-xs text-muted">{String(row.targetType ?? "Platformă")} · {String(row.reason ?? "Motiv protejat")}</p></div><time className="text-xs text-faint">{new Date(String(row.createdAt)).toLocaleString("ro-RO")}</time></li>; })}</ul>}
          </CardContent></Card>
        </div>
      )}
    </AdminShell>
  );
}

function TrendSummary({ label, value, points }: { label: string; value: number; points: number[] }) {
  return <div className="rounded-xl bg-subtle/65 p-4"><p className="text-xs font-medium text-muted">{label}</p><div className="mt-3 flex items-end justify-between gap-3"><strong className="text-2xl tabular-nums">{value}</strong><Sparkline points={points} /></div></div>;
}

function Priority({ href, label, value, critical = false }: { href: string; label: string; value: number; critical?: boolean }) {
  return <Link href={href} className="flex min-h-12 items-center gap-3 rounded-lg px-3 hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">{value > 0 ? <AlertTriangle className={`size-4 ${critical ? "text-danger" : "text-warning"}`} /> : <CircleCheck className="size-4 text-success" />}<span className="flex-1 text-sm font-medium">{label}</span><Badge variant={value > 0 ? (critical ? "danger" : "warning") : "success"}>{value}</Badge></Link>;
}
