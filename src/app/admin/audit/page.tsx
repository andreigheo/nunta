"use client";

import * as React from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Badge, Button, Card, CardContent, CardSkeleton, Input, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { apiErrorMessage, type OperationResource, weddingOsApi } from "@/lib/api/client";

const PAGE_SIZE = 25;

export default function AuditPage() {
  const [items, setItems] = React.useState<OperationResource[]>([]);
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => { const timer = window.setTimeout(() => { setDebouncedQuery(query); setPage(1); }, 250); return () => window.clearTimeout(timer); }, [query]);
  const load = React.useCallback(async () => { setLoading(true); setError(null); try { const response = await weddingOsApi.platformAuditActions({ query: debouncedQuery, page, pageSize: PAGE_SIZE }); setItems(response.items); setTotal(response.total); } catch (caught) { setError(apiErrorMessage(caught)); } finally { setLoading(false); } }, [debouncedQuery, page]);
  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return <AdminShell title="Audit administrativ" subtitle="Istoric imuabil al acțiunilor administrative, cu actor, capabilitate, motiv și țintă." actions={<Button size="sm" variant="outline" loading={loading} onClick={() => void load()}><RefreshCw className="size-4" />Actualizează</Button>}>
    <Card><CardContent className="p-4.5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><Input value={query} onChange={(event) => setQuery(event.target.value)} icon={<Search className="size-4" />} placeholder="Caută acțiune, capabilitate sau țintă…" className="max-w-md" /><Badge variant="neutral">{total} acțiuni</Badge></div>
      {loading && !items.length ? <CardSkeleton lines={8} /> : error ? <div className="flex gap-3 rounded-lg border border-danger/25 bg-danger-soft p-4"><AlertTriangle className="size-5 text-danger" /><p className="text-sm">{error}</p></div> : !items.length ? <p className="rounded-lg bg-subtle p-5 text-sm text-muted">Nu există acțiuni pentru filtrul curent.</p> : <Table minWidth="960px"><THead><TR><TH>Acțiune</TH><TH>Capabilitate</TH><TH>Țintă</TH><TH>Motiv</TH><TH>Rezultat</TH><TH>Dată</TH></TR></THead><TBody>{items.map((item) => { const row = item as Record<string, unknown>; return <TR key={item.id}><TD className="font-medium">{String(row.action)}</TD><TD><code className="text-xs text-muted">{String(row.capability)}</code></TD><TD><p>{String(row.targetType)}</p><p className="font-mono text-[11px] text-faint">{String(row.targetId ?? "-")}</p></TD><TD className="max-w-sm text-sm text-muted">{String(row.reason)}</TD><TD><Badge variant={row.outcome === "SUCCESS" ? "success" : "danger"}>{String(row.outcome)}</Badge></TD><TD className="text-xs text-muted">{new Date(String(row.createdAt)).toLocaleString("ro-RO")}</TD></TR>; })}</TBody></Table>}
      <div className="mt-4 flex items-center justify-between"><p className="text-xs text-muted">Pagina {page} din {pages}</p><div className="flex gap-2"><Button size="icon-sm" variant="outline" aria-label="Pagina anterioară" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="size-4" /></Button><Button size="icon-sm" variant="outline" aria-label="Pagina următoare" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}><ChevronRight className="size-4" /></Button></div></div>
    </CardContent></Card>
  </AdminShell>;
}
