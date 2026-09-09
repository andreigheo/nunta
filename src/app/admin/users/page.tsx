"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight, RefreshCw, Search, UserPlus } from "lucide-react";
import { AdminActionModal } from "@/components/admin/admin-action-modal";
import { AdminShell } from "@/components/admin/admin-shell";
import { Badge, Button, Card, CardContent, CardSkeleton, Field, Input, Modal, Select, Table, TBody, TD, TH, THead, TR, Textarea, useToast } from "@/components/ui";
import { apiErrorMessage, type OperationResource, type PlatformUserResource, weddingOsApi } from "@/lib/api/client";

const PAGE_SIZE = 25;
const intentLabels: Record<PlatformUserResource["registrationIntent"], string> = {
  EVENT_ORGANIZER: "Organizator",
  SERVICE_PROVIDER: "Furnizor",
  INVITED_MEMBER: "Membru invitat",
};

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
  const [createOpen, setCreateOpen] = React.useState(false);

  React.useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedQuery(query); setPage(1); }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await weddingOsApi.platformUsers({ query: debouncedQuery, status, page, pageSize: PAGE_SIZE });
      setItems(response.items);
      setTotal(response.total);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, status, page]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const suspending = selected?.status === "ACTIVE";

  return (
    <AdminShell
      title="Utilizatori"
      subtitle="Creează conturi, gestionează tipul de utilizator, accesul la evenimente, rolurile de platformă și abonamentele."
      actions={<div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" loading={loading} onClick={() => void load()}><RefreshCw className="size-4" />Actualizează</Button><Button size="sm" onClick={() => setCreateOpen(true)}><UserPlus className="size-4" />Adaugă utilizator</Button></div>}
    >
      <Card><CardContent className="p-4.5">
        <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem_auto]">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} icon={<Search className="size-4" />} placeholder="Caută după nume sau email…" />
          <Select aria-label="Filtrează după stare" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">Toate stările</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspendate</option><option value="DISABLED">Dezactivate</option></Select>
          <Badge variant="neutral" className="h-11 justify-center">{total} conturi</Badge>
        </div>
        {loading && !items.length ? <CardSkeleton lines={8} /> : error ? <div className="flex gap-3 rounded-lg border border-danger/25 bg-danger-soft p-4"><AlertTriangle className="size-5 text-danger" /><p className="text-sm">{error}</p></div> : !items.length ? <p className="rounded-lg bg-subtle p-5 text-sm text-muted">Nu există utilizatori pentru filtrul curent.</p> : (
          <Table minWidth="1040px"><THead><TR><TH>Utilizator</TH><TH>Tip cont</TH><TH>Stare</TH><TH>Email</TH><TH>Evenimente</TH><TH>Acces platformă</TH><TH>Înregistrat</TH><TH align="right">Acțiuni</TH></TR></THead><TBody>
            {items.map((user) => <TR key={user.id}>
              <TD><Link href={`/admin/users/${user.id}`} className="font-semibold text-ink hover:text-brand hover:underline">{[user.profile?.firstName, user.profile?.lastName].filter(Boolean).join(" ") || "Fără nume"}</Link><p className="text-xs text-muted">{user.email}</p></TD>
              <TD>{intentLabels[user.registrationIntent]}</TD>
              <TD><Badge variant={user.status === "ACTIVE" ? "success" : user.status === "SUSPENDED" ? "danger" : "neutral"}>{user.status}</Badge></TD>
              <TD><Badge variant={user.emailVerified ? "success" : "warning"}>{user.emailVerified ? "Verificat" : "În așteptare"}</Badge></TD>
              <TD>{user.membershipCount}</TD>
              <TD>{user.platformRoleKeys.length ? <Badge variant="brand">{user.platformRoleKeys.length} roluri</Badge> : <span className="text-muted">Fără acces admin</span>}</TD>
              <TD>{new Date(user.createdAt).toLocaleDateString("ro-RO")}</TD>
              <TD align="right"><div className="flex justify-end gap-2"><Link href={`/admin/users/${user.id}`} className="inline-flex min-h-9 items-center rounded-lg border border-line bg-surface px-3 text-sm font-semibold hover:bg-subtle">Gestionează</Link><Button size="sm" variant={user.status === "ACTIVE" ? "destructive-outline" : "outline"} onClick={() => setSelected(user)}>{user.status === "ACTIVE" ? "Suspendă" : "Reactivează"}</Button></div></TD>
            </TR>)}
          </TBody></Table>
        )}
        <div className="mt-4 flex items-center justify-between"><p className="text-xs text-muted">Pagina {page} din {pages}</p><div className="flex gap-2"><Button size="icon-sm" variant="outline" aria-label="Pagina anterioară" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="size-4" /></Button><Button size="icon-sm" variant="outline" aria-label="Pagina următoare" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}><ChevronRight className="size-4" /></Button></div></div>
      </CardContent></Card>
      {selected ? <AdminActionModal open onClose={() => setSelected(null)} title={suspending ? "Suspendă utilizatorul" : "Reactivează utilizatorul"} description={selected.email} impact={suspending ? "Contul va fi blocat, iar sesiunile active vor fi revocate imediat." : "Utilizatorul va putea intra din nou în cont. Sesiunile vechi rămân revocate."} purpose={suspending ? "USER_SUSPEND" : undefined} confirmLabel={suspending ? "Suspendă contul" : "Reactivează contul"} destructive={suspending} onConfirm={async (reason) => { await weddingOsApi.changePlatformUserStatus(selected.id, suspending ? "suspend" : "reactivate", selected.version, reason); toast({ title: suspending ? "Cont suspendat" : "Cont reactivat", description: "Acțiunea a fost înregistrată în audit.", variant: "success" }); await load(); }} /> : null}
      {createOpen ? <CreateUserModal onClose={() => setCreateOpen(false)} onCreated={async () => { setCreateOpen(false); toast({ title: "Utilizator adăugat", description: "Am trimis emailul securizat pentru alegerea parolei și acceptarea termenilor.", variant: "success" }); setPage(1); await load(); }} /> : null}
    </AdminShell>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [intent, setIntent] = React.useState<PlatformUserResource["registrationIntent"]>("EVENT_ORGANIZER");
  const [platformRoleKey, setPlatformRoleKey] = React.useState("");
  const [roles, setRoles] = React.useState<OperationResource[]>([]);
  const [reason, setReason] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => { void weddingOsApi.platformAccess().then((response) => setRoles(response.roles)).catch(() => setRoles([])); }, []);

  const submit = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || reason.trim().length < 8 || !password || !code.trim()) { setError("Completează identitatea, motivul, parola și codul MFA."); return; }
    setBusy(true);
    setError(null);
    try {
      const challenge = await weddingOsApi.createAdminStepUp("USER_PROVISION", password);
      await weddingOsApi.verifyAdminStepUp(challenge.challengeId, code.trim());
      await weddingOsApi.createPlatformUser({ firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), registrationIntent: intent, platformRoleKey: platformRoleKey || null, reason: reason.trim() });
      await onCreated();
    } catch (caught) { setError(apiErrorMessage(caught)); } finally { setBusy(false); }
  };

  return <Modal open onClose={onClose} title="Adaugă un utilizator" description="Contul devine utilizabil numai după ce persoana își alege parola și acceptă termenii." size="lg" footer={<><Button variant="ghost" disabled={busy} onClick={onClose}>Anulează</Button><Button loading={busy} onClick={() => void submit()}>Creează și trimite accesul</Button></>}>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Prenume" required><Input value={firstName} onChange={(event) => setFirstName(event.target.value)} /></Field>
      <Field label="Nume" required><Input value={lastName} onChange={(event) => setLastName(event.target.value)} /></Field>
      <Field label="Email" required className="sm:col-span-2"><Input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
      <Field label="Tip de cont" required><Select value={intent} onChange={(event) => setIntent(event.target.value as PlatformUserResource["registrationIntent"])}><option value="EVENT_ORGANIZER">Organizator de eveniment</option><option value="SERVICE_PROVIDER">Furnizor de servicii</option><option value="INVITED_MEMBER">Membru invitat</option></Select></Field>
      <Field label="Acces de platformă" hint="Lasă fără acces pentru utilizatori și testeri obișnuiți."><Select value={platformRoleKey} onChange={(event) => setPlatformRoleKey(event.target.value)}><option value="">Fără acces administrativ</option>{roles.map((role) => { const row = role as Record<string, unknown>; return <option key={role.id} value={String(row.key)}>{String(row.name)}{row.critical ? " · critic" : ""}</option>; })}</Select></Field>
      <Field label="Motiv pentru audit" required className="sm:col-span-2"><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Exemplu: cont de test pentru validarea fluxului de organizator" /></Field>
      <Field label="Parola administrativă" required><Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></Field>
      <Field label="Cod MFA" required><Input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} /></Field>
      {error ? <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger sm:col-span-2">{error}</p> : null}
    </div>
  </Modal>;
}
