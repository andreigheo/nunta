"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, ShieldCheck } from "lucide-react";
import { useParams } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardSkeleton, CardTitle, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { apiErrorMessage, type OperationResource, weddingOsApi } from "@/lib/api/client";

export default function UserDetailPage() {
  const params = useParams<{ userId: string }>();
  const [data, setData] = React.useState<OperationResource | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const load = React.useCallback(async () => { setLoading(true); setError(null); try { setData(await weddingOsApi.platformUser(params.userId)); } catch (caught) { setError(apiErrorMessage(caught)); } finally { setLoading(false); } }, [params.userId]);
  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const row = data as Record<string, unknown> | null; const profile = row?.profile as Record<string, unknown> | null; const memberships = (row?.memberships as OperationResource[] | undefined) ?? []; const sessions = (row?.sessions as OperationResource[] | undefined) ?? [];

  return <AdminShell title={profile ? `${String(profile.firstName)} ${String(profile.lastName)}` : "Detaliu utilizator"} subtitle="Identitate, acces la workspaces și sesiuni. Conținutul privat al evenimentelor nu este expus aici." actions={<><Link href="/admin/users" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-semibold hover:bg-subtle"><ArrowLeft className="size-4" />Utilizatori</Link><Button size="sm" variant="outline" loading={loading} onClick={() => void load()}><RefreshCw className="size-4" />Actualizează</Button></>}>
    {loading && !data ? <CardSkeleton lines={8} /> : error || !row ? <Card><CardContent className="p-5 text-sm text-danger">{error ?? "Utilizator indisponibil."}</CardContent></Card> : <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Info label="Email" value={String(row.email)} /><Info label="Stare" value={String(row.status)} /><Info label="Email verificat" value={row.emailVerified ? "Da" : "Nu"} /><Info label="Creat" value={new Date(String(row.createdAt)).toLocaleString("ro-RO")} /></div><Card><CardHeader><div><CardTitle>Acces la evenimente</CardTitle><CardDescription>Membership-uri explicite și planul comercial asociat fiecărui workspace.</CardDescription></div></CardHeader><CardContent>{memberships.length ? <Table minWidth="760px"><THead><TR><TH>Eveniment</TH><TH>Plan</TH><TH>Acces</TH><TH>Workspace</TH></TR></THead><TBody>{memberships.map((item) => { const membership = item as Record<string, unknown>; return <TR key={item.id}><TD><p className="font-semibold">{String(membership.workspaceTitle ?? "Fără titlu")}</p><p className="text-xs text-muted">{String(membership.workspaceStatus ?? "-")}</p></TD><TD><Badge variant={membership.planKey === "PRO" ? "brand" : membership.planKey === "PLUS" ? "info" : "neutral"}>{String(membership.planKey ?? "FREE")}</Badge></TD><TD><Badge variant={membership.status === "ACTIVE" ? "success" : "neutral"}>{String(membership.status)}</Badge></TD><TD className="font-mono text-xs text-muted">{String(membership.workspaceId)}</TD></TR>; })}</TBody></Table> : <p className="rounded-lg bg-subtle p-4 text-sm text-muted">Contul nu aparține niciunui workspace.</p>}</CardContent></Card><Card><CardHeader><div><CardTitle>Sesiuni</CardTitle><CardDescription>Stare și activitate, fără token-uri sau date brute de autentificare.</CardDescription></div><ShieldCheck className="size-5 text-success" /></CardHeader><CardContent>{sessions.length ? <Table minWidth="620px"><THead><TR><TH>Stare</TH><TH>Ultima activitate</TH><TH>Creată</TH></TR></THead><TBody>{sessions.map((item) => { const session = item as Record<string, unknown>; return <TR key={item.id}><TD><Badge variant={session.active ? "success" : "neutral"}>{session.active ? "Activă" : "Revocată/expirată"}</Badge></TD><TD>{new Date(String(session.lastSeenAt)).toLocaleString("ro-RO")}</TD><TD>{new Date(String(session.createdAt)).toLocaleString("ro-RO")}</TD></TR>; })}</TBody></Table> : <p className="rounded-lg bg-subtle p-4 text-sm text-muted">Nu există sesiuni înregistrate.</p>}</CardContent></Card></div>}
  </AdminShell>;
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-subtle/65 p-4"><p className="text-xs font-medium text-muted">{label}</p><p className="mt-2 break-words font-semibold">{value}</p></div>; }
