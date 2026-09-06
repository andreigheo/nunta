"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Bot, HardDrive, Images, Pencil, Plus, RefreshCw, ShieldCheck, UserCog } from "lucide-react";
import { useParams } from "next/navigation";
import { AdminActionModal } from "@/components/admin/admin-action-modal";
import { AdminShell } from "@/components/admin/admin-shell";
import { WorkspacePlanModal } from "@/components/admin/workspace-plan-modal";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardSkeleton, CardTitle, Field, Input, Modal, Select, Table, TBody, TD, TH, THead, TR, Textarea, useToast } from "@/components/ui";
import { apiErrorMessage, type OperationResource, type PlatformGrantResource, type PlatformUserDetailResource, type PlatformUserMembershipResource, type PlatformUserResource, type PlatformUserUsageResource, weddingOsApi } from "@/lib/api/client";

const intentLabels: Record<PlatformUserResource["registrationIntent"], string> = {
  EVENT_ORGANIZER: "Organizator",
  SERVICE_PROVIDER: "Furnizor",
  INVITED_MEMBER: "Membru invitat",
};

export default function UserDetailPage() {
  const params = useParams<{ userId: string }>();
  const { toast } = useToast();
  const [data, setData] = React.useState<PlatformUserDetailResource | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [statusOpen, setStatusOpen] = React.useState(false);
  const [membershipTarget, setMembershipTarget] = React.useState<PlatformUserMembershipResource | null>(null);
  const [membershipCreateOpen, setMembershipCreateOpen] = React.useState(false);
  const [planTarget, setPlanTarget] = React.useState<PlatformUserMembershipResource | null>(null);
  const [grantTarget, setGrantTarget] = React.useState<PlatformGrantResource | "new" | null>(null);
  const [usage, setUsage] = React.useState<PlatformUserUsageResource | null>(null);
  const [usageRange, setUsageRange] = React.useState<"7d" | "30d" | "90d">("30d");
  const [usageLoading, setUsageLoading] = React.useState(true);
  const [usageError, setUsageError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setData(await weddingOsApi.platformUser(params.userId)); }
    catch (caught) { setError(apiErrorMessage(caught)); }
    finally { setLoading(false); }
  }, [params.userId]);

  React.useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const loadUsage = React.useCallback(async () => {
    setUsageLoading(true);
    setUsageError(null);
    try { setUsage(await weddingOsApi.platformUserUsage(params.userId, usageRange)); }
    catch (caught) { setUsageError(apiErrorMessage(caught)); }
    finally { setUsageLoading(false); }
  }, [params.userId, usageRange]);

  React.useEffect(() => { const timer = window.setTimeout(() => void loadUsage(), 0); return () => window.clearTimeout(timer); }, [loadUsage]);

  const displayName = [data?.profile?.firstName, data?.profile?.lastName].filter(Boolean).join(" ") || "Detaliu utilizator";
  const suspending = data?.status === "ACTIVE";

  return <AdminShell title={displayName} subtitle="Administrează identitatea, accesul la fiecare eveniment, abonamentele și rolurile de platformă fără a expune conținutul privat." actions={<div className="flex flex-wrap gap-2"><Link href="/admin/users" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-semibold hover:bg-subtle"><ArrowLeft className="size-4" />Utilizatori</Link><Button size="sm" variant="outline" loading={loading} onClick={() => void load()}><RefreshCw className="size-4" />Actualizează</Button>{data ? <Button size="sm" onClick={() => setEditOpen(true)}><Pencil className="size-4" />Editează contul</Button> : null}</div>}>
    {loading && !data ? <CardSkeleton lines={8} /> : error || !data ? <Card><CardContent className="p-5 text-sm text-danger">{error ?? "Utilizator indisponibil."}</CardContent></Card> : <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><Info label="Email" value={data.email} /><Info label="Stare" value={data.status} /><Info label="Tip cont" value={intentLabels[data.registrationIntent]} /><Info label="Email verificat" value={data.emailVerified ? "Da" : "Nu"} /><Info label="Termeni acceptați" value={data.termsAccepted ? "Da" : "În așteptare"} /></div>

      <Card><CardHeader><div><CardTitle>Control cont</CardTitle><CardDescription>Starea contului este distinctă de plan și de drepturile din evenimente.</CardDescription></div><Button size="sm" variant={suspending ? "destructive-outline" : "outline"} onClick={() => setStatusOpen(true)}>{suspending ? "Suspendă contul" : "Reactivează contul"}</Button></CardHeader></Card>

      <Card>
        <CardHeader>
          <div><CardTitle>Consum și stocare</CardTitle><CardDescription>Agregate operaționale fără nume de fișiere, conținut media, prompturi sau date ale participanților.</CardDescription></div>
          <Field label="Perioadă AI" className="w-36"><Select value={usageRange} onChange={(event) => setUsageRange(event.target.value as "7d" | "30d" | "90d")}><option value="7d">Ultimele 7 zile</option><option value="30d">Ultimele 30 zile</option><option value="90d">Ultimele 90 zile</option></Select></Field>
        </CardHeader>
        <CardContent>
          {usageLoading && !usage ? <CardSkeleton lines={5} /> : usageError || !usage ? <p role="alert" className="rounded-lg bg-danger-soft p-4 text-sm text-danger">{usageError ?? "Datele de consum nu sunt disponibile."}</p> : <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <UsageMetric icon={<Bot className="size-4" />} label="Execuții AI" value={formatNumber(usage.ai.runs)} detail={`${formatNumber(usage.ai.inputUnits + usage.ai.outputUnits)} unități · cost intern ${formatNumber(usage.ai.estimatedCostMinor)} unități minore`} />
              <UsageMetric icon={<HardDrive className="size-4" />} label="Încărcat direct" value={formatBytes(usage.personalUploads.bytes)} detail={`${formatNumber(usage.personalUploads.files)} fișiere`} />
              <UsageMetric icon={<Images className="size-4" />} label="Spațiu evenimente deținute" value={formatBytes(usage.ownedEvents.totalBytes)} detail={`${formatNumber(usage.ownedEvents.storedObjects)} obiecte în ${formatNumber(usage.ownedEvents.count)} evenimente`} />
              <UsageMetric icon={<Images className="size-4" />} label="Materiale participanți" value={formatNumber(usage.ownedEvents.guestMedia.items)} detail={`${formatBytes(usage.ownedEvents.guestMedia.bytes)} · ${formatNumber(usage.ownedEvents.guestMedia.images)} imagini · ${formatNumber(usage.ownedEvents.guestMedia.videos)} video`} />
            </div>
            <div className="grid gap-3 text-xs text-muted lg:grid-cols-2"><p className="rounded-lg border border-line bg-subtle/45 p-3"><span className="font-semibold text-foreground">Stocare personală:</span> {usage.attribution.personalStorage}</p><p className="rounded-lg border border-line bg-subtle/45 p-3"><span className="font-semibold text-foreground">Stocare comună:</span> {usage.attribution.ownedEventStorage}</p></div>
            <p className="text-xs text-muted">{usage.attribution.accountingNote}</p>
            {usage.events.length ? <Table minWidth="980px"><THead><TR><TH>Eveniment</TH><TH>Plan</TH><TH>Stocare totală</TH><TH>Materiale participanți</TH><TH>Moderare</TH><TH>AI în perioadă</TH></TR></THead><TBody>{usage.events.map((event) => <TR key={event.workspaceId}><TD><p className="font-semibold">{event.title}</p><p className="text-xs text-muted">{formatNumber(event.storedObjects)} obiecte</p></TD><TD><Badge variant={event.planKey === "PRO" ? "brand" : event.planKey === "PLUS" ? "info" : "neutral"}>{event.planKey}</Badge></TD><TD>{formatBytes(event.totalBytes)}</TD><TD><p>{formatNumber(event.guestMedia.items)} materiale</p><p className="text-xs text-muted">{formatNumber(event.guestMedia.images)} imagini · {formatNumber(event.guestMedia.videos)} video · {formatBytes(event.guestMedia.bytes)}</p></TD><TD><div className="flex flex-wrap gap-1"><Badge variant={event.guestMedia.pending ? "warning" : "neutral"}>{event.guestMedia.pending} de verificat</Badge><Badge variant={event.guestMedia.rejected ? "danger" : "success"}>{event.guestMedia.rejected} respinse</Badge></div></TD><TD><p>{formatNumber(event.ai.runs)} execuții</p><p className="text-xs text-muted">{formatNumber(event.ai.inputUnits + event.ai.outputUnits)} unități</p></TD></TR>)}</TBody></Table> : <p className="rounded-lg bg-subtle p-4 text-sm text-muted">Utilizatorul nu deține activ niciun eveniment. Consumul din spațiile unde este doar colaborator nu este atribuit contului.</p>}
          </div>}
        </CardContent>
      </Card>

      <Card><CardHeader><div><CardTitle>Acces la evenimente</CardTitle><CardDescription>Rolul stabilește ce poate face persoana în eveniment; planul stabilește limitele și funcțiile comerciale ale acelui eveniment.</CardDescription></div><Button size="sm" onClick={() => setMembershipCreateOpen(true)}><Plus className="size-4" />Adaugă la eveniment</Button></CardHeader><CardContent>{data.memberships.length ? <Table minWidth="980px"><THead><TR><TH>Eveniment</TH><TH>Rol</TH><TH>Plan</TH><TH>Acces</TH><TH align="right">Acțiuni</TH></TR></THead><TBody>{data.memberships.map((membership) => <TR key={membership.id}><TD><p className="font-semibold">{membership.workspaceTitle}</p><p className="text-xs text-muted">{membership.workspaceStatus}</p></TD><TD>{membership.roleTemplateName}</TD><TD><Badge variant={membership.planKey === "PRO" ? "brand" : membership.planKey === "PLUS" ? "info" : "neutral"}>{membership.planKey}</Badge>{membership.subscriptionProviderManaged ? <p className="mt-1 text-xs text-muted">Gestionat de furnizor</p> : null}</TD><TD><Badge variant={membership.status === "ACTIVE" ? "success" : "neutral"}>{membership.status}</Badge></TD><TD align="right"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setMembershipTarget(membership)}>Schimbă rolul</Button><Button size="sm" variant="outline" onClick={() => setPlanTarget(membership)}>Schimbă planul</Button></div></TD></TR>)}</TBody></Table> : <p className="rounded-lg bg-subtle p-4 text-sm text-muted">Contul nu aparține încă niciunui eveniment.</p>}</CardContent></Card>

      <Card><CardHeader><div><CardTitle>Acces administrativ la platformă</CardTitle><CardDescription>Roluri interne separate de rolurile utilizatorilor. Acordarea și revocarea cer MFA și sunt auditate.</CardDescription></div><Button size="sm" onClick={() => setGrantTarget("new")}><UserCog className="size-4" />Acordă rol</Button></CardHeader><CardContent>{data.platformGrants.length ? <Table minWidth="800px"><THead><TR><TH>Rol</TH><TH>Nivel</TH><TH>Stare</TH><TH>Valabil până</TH><TH align="right">Acțiune</TH></TR></THead><TBody>{data.platformGrants.map((grant) => <TR key={grant.id}><TD><p className="font-semibold">{grant.roleName}</p><p className="font-mono text-xs text-muted">{grant.roleKey}</p></TD><TD><Badge variant={grant.critical ? "warning" : "neutral"}>{grant.critical ? "Critic" : "Standard"}</Badge></TD><TD><Badge variant={grant.active ? "success" : "neutral"}>{grant.active ? "Activ" : "Revocat/expirat"}</Badge></TD><TD>{grant.validUntil ? new Date(grant.validUntil).toLocaleDateString("ro-RO") : "Fără expirare"}</TD><TD align="right"><Button size="sm" variant={grant.active ? "destructive-outline" : "outline"} onClick={() => setGrantTarget(grant)}>{grant.active ? "Revocă" : "Reactivează"}</Button></TD></TR>)}</TBody></Table> : <p className="rounded-lg bg-subtle p-4 text-sm text-muted">Utilizatorul nu are acces administrativ la platformă.</p>}</CardContent></Card>

      <Card><CardHeader><div><CardTitle>Sesiuni</CardTitle><CardDescription>Stare și activitate, fără token-uri sau date brute de autentificare.</CardDescription></div><ShieldCheck className="size-5 text-success" /></CardHeader><CardContent>{data.sessions.length ? <Table minWidth="620px"><THead><TR><TH>Stare</TH><TH>Ultima activitate</TH><TH>Creată</TH></TR></THead><TBody>{data.sessions.map((session) => <TR key={session.id}><TD><Badge variant={session.active ? "success" : "neutral"}>{session.active ? "Activă" : "Revocată/expirată"}</Badge></TD><TD>{new Date(session.lastSeenAt).toLocaleString("ro-RO")}</TD><TD>{new Date(session.createdAt).toLocaleString("ro-RO")}</TD></TR>)}</TBody></Table> : <p className="rounded-lg bg-subtle p-4 text-sm text-muted">Nu există sesiuni înregistrate.</p>}</CardContent></Card>
    </div>}

    {data && editOpen ? <EditUserModal user={data} onClose={() => setEditOpen(false)} onSaved={async () => { setEditOpen(false); toast({ title: "Cont actualizat", description: "Profilul și tipul de cont au fost salvate în audit.", variant: "success" }); await load(); }} /> : null}
    {data && statusOpen ? <AdminActionModal open onClose={() => setStatusOpen(false)} title={suspending ? "Suspendă utilizatorul" : "Reactivează utilizatorul"} description={data.email} impact={suspending ? "Contul va fi blocat, iar toate sesiunile active vor fi revocate." : "Utilizatorul va putea intra din nou în cont; sesiunile vechi rămân revocate."} purpose={suspending ? "USER_SUSPEND" : undefined} confirmLabel={suspending ? "Suspendă contul" : "Reactivează contul"} destructive={suspending} onConfirm={async (reason) => { await weddingOsApi.changePlatformUserStatus(data.id, suspending ? "suspend" : "reactivate", data.version, reason); toast({ title: suspending ? "Cont suspendat" : "Cont reactivat", variant: "success" }); await load(); }} /> : null}
    {data && membershipTarget ? <MembershipRoleModal userId={data.id} membership={membershipTarget} roles={data.availableWorkspaceRoles} onClose={() => setMembershipTarget(null)} onSaved={async () => { setMembershipTarget(null); toast({ title: "Rol actualizat", description: "Noul acces este activ în eveniment.", variant: "success" }); await load(); }} /> : null}
    {data && membershipCreateOpen ? <CreateMembershipModal userId={data.id} roles={data.availableWorkspaceRoles} onClose={() => setMembershipCreateOpen(false)} onSaved={async () => { setMembershipCreateOpen(false); toast({ title: "Acces la eveniment acordat", description: "Utilizatorul poate intra în eveniment cu rolul selectat.", variant: "success" }); await load(); }} /> : null}
    {data && grantTarget ? <PlatformGrantModal userId={data.id} target={grantTarget} roles={data.availablePlatformRoles} onClose={() => setGrantTarget(null)} onSaved={async () => { setGrantTarget(null); toast({ title: "Acces administrativ actualizat", description: "Schimbarea este activă și auditată.", variant: "success" }); await load(); }} /> : null}
    {planTarget ? <WorkspacePlanModal target={{ id: planTarget.workspaceId, version: planTarget.workspaceVersion, createdAt: data?.createdAt ?? new Date().toISOString(), updatedAt: data?.updatedAt ?? new Date().toISOString(), title: planTarget.workspaceTitle, subscription: { planKey: planTarget.planKey } } as OperationResource} onClose={() => setPlanTarget(null)} onSaved={async () => { setPlanTarget(null); toast({ title: "Plan actualizat", description: "Planul evenimentului a fost schimbat și auditat.", variant: "success" }); await load(); }} /> : null}
  </AdminShell>;
}

function EditUserModal({ user, onClose, onSaved }: { user: PlatformUserDetailResource; onClose: () => void; onSaved: () => Promise<void> }) {
  const [firstName, setFirstName] = React.useState(user.profile?.firstName ?? "");
  const [lastName, setLastName] = React.useState(user.profile?.lastName ?? "");
  const [intent, setIntent] = React.useState(user.registrationIntent);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const submit = async () => { if (!firstName.trim() || !lastName.trim() || reason.trim().length < 8) { setError("Completează numele și un motiv de minimum 8 caractere."); return; } setBusy(true); setError(null); try { await weddingOsApi.updatePlatformUser(user.id, user.version, { firstName: firstName.trim(), lastName: lastName.trim(), registrationIntent: intent, reason: reason.trim() }); await onSaved(); } catch (caught) { setError(apiErrorMessage(caught)); } finally { setBusy(false); } };
  return <Modal open onClose={onClose} title="Editează contul" description="Emailul și parola nu pot fi rescrise din această operație." size="sm" footer={<><Button variant="ghost" disabled={busy} onClick={onClose}>Anulează</Button><Button loading={busy} onClick={() => void submit()}>Salvează</Button></>}><div className="space-y-4"><Field label="Prenume" required><Input value={firstName} onChange={(event) => setFirstName(event.target.value)} /></Field><Field label="Nume" required><Input value={lastName} onChange={(event) => setLastName(event.target.value)} /></Field><Field label="Tip de cont" required><Select value={intent} onChange={(event) => setIntent(event.target.value as PlatformUserResource["registrationIntent"])}><option value="EVENT_ORGANIZER">Organizator</option><option value="SERVICE_PROVIDER">Furnizor</option><option value="INVITED_MEMBER">Membru invitat</option></Select></Field><Field label="Motiv pentru audit" required><Textarea value={reason} onChange={(event) => setReason(event.target.value)} /></Field>{error ? <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</p> : null}</div></Modal>;
}

function MembershipRoleModal({ userId, membership, roles, onClose, onSaved }: { userId: string; membership: PlatformUserMembershipResource; roles: PlatformUserDetailResource["availableWorkspaceRoles"]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [roleKey, setRoleKey] = React.useState(membership.roleTemplateKey);
  const [reason, setReason] = React.useState(""); const [password, setPassword] = React.useState(""); const [code, setCode] = React.useState(""); const [busy, setBusy] = React.useState(false); const [error, setError] = React.useState<string | null>(null);
  const submit = async () => { if (reason.trim().length < 8 || !password || !code.trim()) { setError("Completează motivul, parola și codul MFA."); return; } setBusy(true); setError(null); try { const challenge = await weddingOsApi.createAdminStepUp("USER_ACCESS_CHANGE", password); await weddingOsApi.verifyAdminStepUp(challenge.challengeId, code.trim()); await weddingOsApi.setPlatformUserMembershipRole(userId, membership.id, roleKey, membership.version, reason.trim()); await onSaved(); } catch (caught) { setError(apiErrorMessage(caught)); } finally { setBusy(false); } };
  return <Modal open onClose={onClose} title="Schimbă rolul din eveniment" description={membership.workspaceTitle} size="sm" footer={<><Button variant="ghost" disabled={busy} onClick={onClose}>Anulează</Button><Button loading={busy} onClick={() => void submit()}>Aplică rolul</Button></>}><div className="space-y-4"><p className="rounded-lg border border-warning/25 bg-warning-soft p-3 text-sm">Ultimul proprietar activ al unui eveniment nu poate fi retrogradat.</p><Field label="Rol" required><Select value={roleKey} onChange={(event) => setRoleKey(event.target.value)}>{roles.map((role) => <option key={role.key} value={role.key}>{role.name}</option>)}</Select></Field><SensitiveFields reason={reason} setReason={setReason} password={password} setPassword={setPassword} code={code} setCode={setCode} />{error ? <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</p> : null}</div></Modal>;
}

function CreateMembershipModal({ userId, roles, onClose, onSaved }: { userId: string; roles: PlatformUserDetailResource["availableWorkspaceRoles"]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [workspaces, setWorkspaces] = React.useState<OperationResource[]>([]);
  const [workspaceId, setWorkspaceId] = React.useState("");
  const [roleKey, setRoleKey] = React.useState(roles[0]?.key ?? "viewer");
  const [reason, setReason] = React.useState(""); const [password, setPassword] = React.useState(""); const [code, setCode] = React.useState(""); const [busy, setBusy] = React.useState(false); const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { void weddingOsApi.platformWorkspaces({ page: 1, pageSize: 100 }).then((response) => { setWorkspaces(response.items); setWorkspaceId((current) => current || response.items[0]?.id || ""); }).catch((caught) => setError(apiErrorMessage(caught))); }, []);
  const submit = async () => { if (!workspaceId || !roleKey || reason.trim().length < 8 || !password || !code.trim()) { setError("Selectează evenimentul și completează motivul, parola și codul MFA."); return; } setBusy(true); setError(null); try { const challenge = await weddingOsApi.createAdminStepUp("USER_ACCESS_CHANGE", password); await weddingOsApi.verifyAdminStepUp(challenge.challengeId, code.trim()); await weddingOsApi.createPlatformUserMembership(userId, workspaceId, roleKey, reason.trim()); await onSaved(); } catch (caught) { setError(apiErrorMessage(caught)); } finally { setBusy(false); } };
  return <Modal open onClose={onClose} title="Adaugă utilizatorul la un eveniment" description="Acces direct, protejat prin MFA și înregistrat în audit." size="sm" footer={<><Button variant="ghost" disabled={busy} onClick={onClose}>Anulează</Button><Button loading={busy} onClick={() => void submit()}>Acordă accesul</Button></>}><div className="space-y-4"><Field label="Eveniment" required><Select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}><option value="" disabled>Selectează evenimentul</option>{workspaces.map((workspace) => { const row = workspace as Record<string, unknown>; return <option key={workspace.id} value={workspace.id}>{String(row.title ?? workspace.id)}</option>; })}</Select></Field><Field label="Rol" required><Select value={roleKey} onChange={(event) => setRoleKey(event.target.value)}>{roles.map((role) => <option key={role.key} value={role.key}>{role.name}</option>)}</Select></Field><SensitiveFields reason={reason} setReason={setReason} password={password} setPassword={setPassword} code={code} setCode={setCode} />{error ? <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</p> : null}</div></Modal>;
}

function PlatformGrantModal({ userId, target, roles, onClose, onSaved }: { userId: string; target: PlatformGrantResource | "new"; roles: PlatformUserDetailResource["availablePlatformRoles"]; onClose: () => void; onSaved: () => Promise<void> }) {
  const existing = target === "new" ? null : target;
  const [roleKey, setRoleKey] = React.useState(existing?.roleKey ?? roles[0]?.key ?? "");
  const [validUntil, setValidUntil] = React.useState(existing?.validUntil?.slice(0, 10) ?? "");
  const [reason, setReason] = React.useState(""); const [password, setPassword] = React.useState(""); const [code, setCode] = React.useState(""); const [busy, setBusy] = React.useState(false); const [error, setError] = React.useState<string | null>(null);
  const active = existing ? !existing.active : true;
  const submit = async () => { if (!roleKey || reason.trim().length < 8 || !password || !code.trim()) { setError("Selectează rolul și completează motivul, parola și codul MFA."); return; } setBusy(true); setError(null); try { const challenge = await weddingOsApi.createAdminStepUp("USER_ACCESS_CHANGE", password); await weddingOsApi.verifyAdminStepUp(challenge.challengeId, code.trim()); await weddingOsApi.setPlatformUserGrant(userId, { roleKey, active, validUntil: active && validUntil ? new Date(`${validUntil}T23:59:59.000Z`).toISOString() : null, version: existing?.version, reason: reason.trim() }); await onSaved(); } catch (caught) { setError(apiErrorMessage(caught)); } finally { setBusy(false); } };
  return <Modal open onClose={onClose} title={existing?.active ? "Revocă accesul de platformă" : existing ? "Reactivează accesul de platformă" : "Acordă acces de platformă"} description="Operație critică protejată prin parolă, MFA și audit." size="sm" footer={<><Button variant="ghost" disabled={busy} onClick={onClose}>Anulează</Button><Button variant={existing?.active ? "destructive" : "primary"} loading={busy} onClick={() => void submit()}>{existing?.active ? "Revocă rolul" : "Acordă rolul"}</Button></>}><div className="space-y-4"><Field label="Rol de platformă" required><Select value={roleKey} disabled={Boolean(existing)} onChange={(event) => setRoleKey(event.target.value)}>{roles.map((role) => <option key={role.key} value={role.key}>{role.name}{role.critical ? " · critic" : ""}</option>)}</Select></Field>{active ? <Field label="Expiră la" hint="Opțional. Lasă gol pentru acces fără expirare."><Input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></Field> : null}<SensitiveFields reason={reason} setReason={setReason} password={password} setPassword={setPassword} code={code} setCode={setCode} />{error ? <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</p> : null}</div></Modal>;
}

function SensitiveFields({ reason, setReason, password, setPassword, code, setCode }: { reason: string; setReason: (value: string) => void; password: string; setPassword: (value: string) => void; code: string; setCode: (value: string) => void }) { return <><Field label="Motiv pentru audit" required><Textarea value={reason} onChange={(event) => setReason(event.target.value)} /></Field><Field label="Parola administrativă" required><Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></Field><Field label="Cod MFA" required><Input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} /></Field></>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-subtle/65 p-4"><p className="text-xs font-medium text-muted">{label}</p><p className="mt-2 break-words font-semibold">{value}</p></div>; }
function UsageMetric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) { return <div className="rounded-xl border border-line bg-surface p-4"><div className="flex items-center gap-2 text-xs font-semibold text-muted">{icon}{label}</div><p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted">{detail}</p></div>; }
function formatNumber(value: number) { return new Intl.NumberFormat("ro-RO").format(value); }
function formatBytes(value: number) { if (!Number.isFinite(value) || value <= 0) return "0 B"; const units = ["B", "KB", "MB", "GB", "TB"]; const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1); const amount = value / 1024 ** index; return `${new Intl.NumberFormat("ro-RO", { maximumFractionDigits: amount >= 10 || index === 0 ? 0 : 1 }).format(amount)} ${units[index]}`; }
