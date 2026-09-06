"use client";

import * as React from "react";
import { AlertTriangle, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardSkeleton, CardTitle } from "@/components/ui";
import { apiErrorMessage, type PlatformAccessResource, weddingOsApi } from "@/lib/api/client";

export default function AccessPage() {
  const [data, setData] = React.useState<PlatformAccessResource | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const load = React.useCallback(async () => { setLoading(true); setError(null); try { setData(await weddingOsApi.platformAccess()); } catch (caught) { setError(apiErrorMessage(caught)); } finally { setLoading(false); } }, []);
  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return <AdminShell title="Acces administrativ" subtitle="Roluri și granturi active în mediul curent. Modificarea accesului rămâne indisponibilă până la implementarea aprobării duale." actions={<Button size="sm" variant="outline" loading={loading} onClick={() => void load()}><RefreshCw className="size-4" />Actualizează</Button>}>
    {loading && !data ? <CardSkeleton lines={8} /> : error || !data ? <Card className="border-danger/25"><CardContent className="flex gap-3 p-5"><AlertTriangle className="size-5 text-danger" /><p className="text-sm">{error}</p></CardContent></Card> : <div className="grid gap-5 xl:grid-cols-2">
      <Card><CardHeader><div><CardTitle>Roluri</CardTitle><CardDescription>Capabilități definite central, fără permisiuni implicite.</CardDescription></div><LockKeyhole className="size-5 text-faint" /></CardHeader><CardContent className="space-y-3">{data.roles.map((item) => { const row = item as Record<string, unknown>; const capabilities = Array.isArray(row.capabilities) ? row.capabilities : []; return <article key={item.id} className="rounded-xl border border-line p-4"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{String(row.name ?? row.key)}</h2>{row.critical ? <Badge variant="warning">Critic</Badge> : null}{row.system ? <Badge variant="neutral">Sistem</Badge> : null}</div><p className="mt-1 text-sm text-muted">{String(row.description ?? "Rol administrativ")}</p><p className="mt-3 text-xs text-faint">{capabilities.length} capabilități</p></article>; })}</CardContent></Card>
      <Card><CardHeader><div><CardTitle>Granturi în mediul curent</CardTitle><CardDescription>Acces explicit, cu motiv și perioadă de valabilitate.</CardDescription></div><ShieldCheck className="size-5 text-success" /></CardHeader><CardContent className="space-y-3">{data.grants.length ? data.grants.map((item) => { const row = item as Record<string, unknown>; const user = row.user as Record<string, unknown> | null; const role = row.role as Record<string, unknown> | null; return <article key={item.id} className="rounded-xl border border-line p-4"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">{String(user?.email ?? row.userId)}</h2><p className="mt-1 text-sm text-muted">{String(role?.name ?? role?.key ?? row.roleId)}</p></div><Badge variant={row.active ? "success" : "neutral"}>{row.active ? "Activ" : "Inactiv"}</Badge></div><p className="mt-3 text-xs leading-5 text-faint">{String(row.reason ?? "Motiv neprecizat")}</p>{row.validUntil ? <p className="mt-2 text-xs text-muted">Valabil până la {new Date(String(row.validUntil)).toLocaleString("ro-RO")}</p> : null}</article>; }) : <p className="rounded-lg bg-subtle p-4 text-sm text-muted">Nu există granturi administrative în acest mediu.</p>}</CardContent></Card>
    </div>}
  </AdminShell>;
}
