"use client";

import * as React from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";
import { AdminActionModal } from "@/components/admin/admin-action-modal";
import { AdminShell } from "@/components/admin/admin-shell";
import { Badge, Button, Card, CardContent, CardSkeleton, Field, Input, Modal, Select, Table, TBody, TD, TH, THead, TR, Textarea, useToast } from "@/components/ui";
import { apiErrorMessage, type OperationResource, weddingOsApi } from "@/lib/api/client";

const PAGE_SIZE = 25;

export default function WorkspacesPage() {
  const { toast } = useToast();
  const [items, setItems] = React.useState<OperationResource[]>([]);
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [statusTarget, setStatusTarget] = React.useState<OperationResource | null>(null);
  const [planTarget, setPlanTarget] = React.useState<OperationResource | null>(null);

  React.useEffect(() => { const timer = window.setTimeout(() => { setDebouncedQuery(query); setPage(1); }, 250); return () => window.clearTimeout(timer); }, [query]);
  const load = React.useCallback(async () => { setLoading(true); setError(null); try { const response = await weddingOsApi.platformWorkspaces({ query: debouncedQuery, status, page, pageSize: PAGE_SIZE }); setItems(response.items); setTotal(response.total); } catch (caught) { setError(apiErrorMessage(caught)); } finally { setLoading(false); } }, [debouncedQuery, status, page]);
  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const statusRow = statusTarget as Record<string, unknown> | null;
  const suspending = statusRow?.status === "ACTIVE";

  return <AdminShell title="Evenimente și workspaces" subtitle="Spațiile de lucru, proprietarii, tipul de eveniment și drepturile comerciale asociate." actions={<Button size="sm" variant="outline" loading={loading} onClick={() => void load()}><RefreshCw className="size-4" />Actualizează</Button>}>
    <Card><CardContent className="p-4.5"><div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem_auto]"><Input value={query} onChange={(event) => setQuery(event.target.value)} icon={<Search className="size-4" />} placeholder="Caută un eveniment…" /><Select aria-label="Filtrează după stare" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">Toate stările</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspendate</option><option value="ARCHIVED">Arhivate</option></Select><Badge variant="neutral" className="h-11 justify-center">{total} workspaces</Badge></div>
      {loading && !items.length ? <CardSkeleton lines={8} /> : error ? <div className="flex gap-3 rounded-lg border border-danger/25 bg-danger-soft p-4"><AlertTriangle className="size-5 text-danger" /><p className="text-sm">{error}</p></div> : !items.length ? <p className="rounded-lg bg-subtle p-5 text-sm text-muted">Nu există evenimente pentru filtrul curent.</p> : <Table minWidth="980px"><THead><TR><TH>Eveniment</TH><TH>Tip</TH><TH>Stare</TH><TH>Plan</TH><TH>Membri</TH><TH>Dată eveniment</TH><TH align="right">Acțiuni</TH></TR></THead><TBody>{items.map((item) => { const row = item as Record<string, unknown>; const subscription = row.subscription as Record<string, unknown> | null; return <TR key={item.id}><TD><p className="font-semibold">{String(row.title ?? "Fără titlu")}</p><p className="font-mono text-[11px] text-faint">{item.id}</p></TD><TD>{String(row.eventType ?? "Nespecificat")}</TD><TD><Badge variant={row.status === "ACTIVE" ? "success" : row.status === "SUSPENDED" ? "danger" : "neutral"}>{String(row.status)}</Badge></TD><TD><Badge variant={subscription?.planKey === "PRO" ? "brand" : subscription?.planKey === "PLUS" ? "info" : "neutral"}>{String(subscription?.planKey ?? "FREE")}</Badge></TD><TD>{String(row.membershipCount ?? 0)}</TD><TD>{row.weddingDate ? new Date(String(row.weddingDate)).toLocaleDateString("ro-RO") : "-"}</TD><TD align="right"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setPlanTarget(item)}>Schimbă planul</Button><Button size="sm" variant={row.status === "ACTIVE" ? "destructive-outline" : "outline"} onClick={() => setStatusTarget(item)}>{row.status === "ACTIVE" ? "Suspendă" : "Reactivează"}</Button></div></TD></TR>; })}</TBody></Table>}
      <div className="mt-4 flex items-center justify-between"><p className="text-xs text-muted">Pagina {page} din {pages}</p><div className="flex gap-2"><Button size="icon-sm" variant="outline" aria-label="Pagina anterioară" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="size-4" /></Button><Button size="icon-sm" variant="outline" aria-label="Pagina următoare" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}><ChevronRight className="size-4" /></Button></div></div>
    </CardContent></Card>
    {statusTarget ? <AdminActionModal open onClose={() => setStatusTarget(null)} title={suspending ? "Suspendă evenimentul" : "Reactivează evenimentul"} description={String(statusRow?.title ?? "Workspace")} impact={suspending ? "Accesul la workspace și operațiile sale va fi blocat." : "Membrii vor putea accesa din nou workspace-ul."} purpose={suspending ? "WORKSPACE_SUSPEND" : undefined} confirmLabel={suspending ? "Suspendă workspace-ul" : "Reactivează workspace-ul"} destructive={suspending} onConfirm={async (reason) => { await weddingOsApi.changePlatformWorkspaceStatus(statusTarget.id, suspending ? "suspend" : "reactivate", statusTarget.version, reason); toast({ title: suspending ? "Workspace suspendat" : "Workspace reactivat", variant: "success" }); await load(); }} /> : null}
    {planTarget ? <WorkspacePlanModal target={planTarget} onClose={() => setPlanTarget(null)} onSaved={async () => { setPlanTarget(null); toast({ title: "Plan actualizat", description: "Modificarea este auditată și aplicată workspace-ului selectat.", variant: "success" }); await load(); }} /> : null}
  </AdminShell>;
}

function WorkspacePlanModal({ target, onClose, onSaved }: { target: OperationResource; onClose: () => void; onSaved: () => Promise<void> }) {
  const row = target as Record<string, unknown>; const subscription = row.subscription as Record<string, unknown> | null;
  const [plan, setPlan] = React.useState<"FREE" | "PLUS" | "PRO">((subscription?.planKey as "FREE" | "PLUS" | "PRO") ?? "FREE");
  const [reason, setReason] = React.useState(""); const [password, setPassword] = React.useState(""); const [code, setCode] = React.useState(""); const [busy, setBusy] = React.useState(false); const [error, setError] = React.useState<string | null>(null);
  const submit = async () => { if (reason.trim().length < 8 || !password || !code) { setError("Completează motivul, parola și codul MFA."); return; } setBusy(true); setError(null); try { const challenge = await weddingOsApi.createAdminStepUp("SUBSCRIPTION_OVERRIDE", password); await weddingOsApi.verifyAdminStepUp(challenge.challengeId, code.trim()); await weddingOsApi.setPlatformWorkspacePlan(target.id, plan, target.version, reason.trim()); await onSaved(); } catch (caught) { setError(apiErrorMessage(caught)); } finally { setBusy(false); } };
  return <Modal open onClose={onClose} title="Schimbă planul workspace-ului" description={String(row.title ?? target.id)} size="sm" footer={<><Button variant="ghost" disabled={busy} onClick={onClose}>Anulează</Button><Button loading={busy} onClick={() => void submit()}>Aplică planul</Button></>}><div className="space-y-4"><p className="rounded-lg border border-warning/25 bg-warning-soft p-3 text-sm leading-5">Planurile gestionate de furnizor nu pot fi rescrise direct. API-ul va opri schimbarea dacă există o subscripție externă activă.</p><Field label="Plan" required><Select value={plan} onChange={(event) => setPlan(event.target.value as "FREE" | "PLUS" | "PRO")}><option value="FREE">Free</option><option value="PLUS">Plus · 19 EUR</option><option value="PRO">Pro · 39 EUR</option></Select></Field><Field label="Motiv pentru audit" required><Textarea value={reason} onChange={(event) => setReason(event.target.value)} /></Field><Field label="Parola administrativă" required><Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></Field><Field label="Cod MFA" required><Input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} /></Field>{error ? <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</p> : null}</div></Modal>;
}
