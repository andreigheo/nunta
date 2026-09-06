"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";
import { AdminActionModal } from "@/components/admin/admin-action-modal";
import { AdminShell } from "@/components/admin/admin-shell";
import { Badge, Button, Card, CardContent, CardSkeleton, Input, Select, Table, TBody, TD, TH, THead, TR, useToast } from "@/components/ui";
import { apiErrorMessage, type PlatformUserResource, weddingOsApi } from "@/lib/api/client";

const PAGE_SIZE = 25;

export default function UsersPage() {
  const { toast } = useToast();
  const [items, setItems] = React.useState<PlatformUserResource[]>([]);
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<PlatformUserResource | null>(null);

  React.useEffect(() => { const timer = window.setTimeout(() => { setDebouncedQuery(query); setPage(1); }, 250); return () => window.clearTimeout(timer); }, [query]);
  const load = React.useCallback(async () => { setLoading(true); setError(null); try { const response = await weddingOsApi.platformUsers({ query: debouncedQuery, status, page, pageSize: PAGE_SIZE }); setItems(response.items); setTotal(response.total); } catch (caught) { setError(apiErrorMessage(caught)); } finally { setLoading(false); } }, [debouncedQuery, status, page]);
  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const suspending = selected?.status === "ACTIVE";

  return <AdminShell title="Utilizatori" subtitle="Conturi, verificare, activitate și apartenențe. Datele sunt paginate și filtrate pe server." actions={<Button size="sm" variant="outline" loading={loading} onClick={() => void load()}><RefreshCw className="size-4" />Actualizează</Button>}>
    <Card><CardContent className="p-4.5"><div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem_auto]"><Input value={query} onChange={(event) => setQuery(event.target.value)} icon={<Search className="size-4" />} placeholder="Caută după nume sau email…" /><Select aria-label="Filtrează după stare" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">Toate stările</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspendate</option><option value="DISABLED">Dezactivate</option></Select><Badge variant="neutral" className="h-11 justify-center">{total} conturi</Badge></div>
      {loading && !items.length ? <CardSkeleton lines={8} /> : error ? <div className="flex gap-3 rounded-lg border border-danger/25 bg-danger-soft p-4"><AlertTriangle className="size-5 text-danger" /><p className="text-sm">{error}</p></div> : !items.length ? <p className="rounded-lg bg-subtle p-5 text-sm text-muted">Nu există utilizatori pentru filtrul curent.</p> : <Table minWidth="840px"><THead><TR><TH>Utilizator</TH><TH>Stare</TH><TH>Email</TH><TH>Evenimente</TH><TH>Sesiuni</TH><TH>Înregistrat</TH><TH align="right">Acțiuni</TH></TR></THead><TBody>{items.map((user) => <TR key={user.id}><TD><Link href={`/admin/users/${user.id}`} className="font-semibold text-ink hover:text-brand hover:underline">{[user.profile?.firstName, user.profile?.lastName].filter(Boolean).join(" ") || "Fără nume"}</Link><p className="text-xs text-muted">{user.email}</p></TD><TD><Badge variant={user.status === "ACTIVE" ? "success" : "danger"}>{user.status === "ACTIVE" ? "Activ" : user.status === "SUSPENDED" ? "Suspendat" : "Dezactivat"}</Badge></TD><TD><Badge variant={user.emailVerified ? "success" : "warning"}>{user.emailVerified ? "Verificat" : "Neverificat"}</Badge></TD><TD>{user.membershipCount}</TD><TD>{user.sessionCount}</TD><TD className="text-xs text-muted">{new Date(String(user.createdAt)).toLocaleDateString("ro-RO")}</TD><TD align="right"><Button size="sm" variant={user.status === "ACTIVE" ? "destructive-outline" : "outline"} onClick={() => setSelected(user)}>{user.status === "ACTIVE" ? "Suspendă" : "Reactivează"}</Button></TD></TR>)}</TBody></Table>}
      <div className="mt-4 flex items-center justify-between"><p className="text-xs text-muted">Pagina {page} din {pages}</p><div className="flex gap-2"><Button size="icon-sm" variant="outline" aria-label="Pagina anterioară" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="size-4" /></Button><Button size="icon-sm" variant="outline" aria-label="Pagina următoare" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}><ChevronRight className="size-4" /></Button></div></div>
    </CardContent></Card>
    {selected ? <AdminActionModal open onClose={() => setSelected(null)} title={suspending ? "Suspendă utilizatorul" : "Reactivează utilizatorul"} description={selected.email} impact={suspending ? "Contul va fi blocat, iar sesiunile active vor fi revocate imediat." : "Utilizatorul va putea intra din nou în cont. Sesiunile vechi rămân revocate."} purpose={suspending ? "USER_SUSPEND" : undefined} confirmLabel={suspending ? "Suspendă contul" : "Reactivează contul"} destructive={suspending} onConfirm={async (reason) => { await weddingOsApi.changePlatformUserStatus(selected.id, suspending ? "suspend" : "reactivate", selected.version, reason); toast({ title: suspending ? "Cont suspendat" : "Cont reactivat", description: "Acțiunea a fost înregistrată în audit.", variant: "success" }); await load(); }} /> : null}
  </AdminShell>;
}
