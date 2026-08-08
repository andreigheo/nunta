"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, ChevronLeft, ChevronRight, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { PortalShell } from "@/components/portals/portal-shell";
import { Badge, Button, Card, CardContent, CardSkeleton, Input, Table, TBody, TD, TH, THead, TR, useToast } from "@/components/ui";
import { apiErrorMessage, type OperationResource, weddingOsApi } from "@/lib/api/client";

const PAGE_SIZE = 20;
const sections = {
  users: { title: "Utilizatori", load: weddingOsApi.platformUsers },
  workspaces: { title: "Workspaces", load: weddingOsApi.platformWorkspaces },
  vendors: { title: "Vendor organizations", load: weddingOsApi.platformVendors },
  support: { title: "Support", load: weddingOsApi.platformSupportCases },
  incidents: { title: "Incidente", load: weddingOsApi.platformIncidents },
  security: { title: "Securitate", load: weddingOsApi.platformSecurityAlerts },
  providers: {
    title: "Providers",
    load: async () => {
      const status = await weddingOsApi.platformSystemStatus();
      return { items: Object.entries(status.providers).map(([id, value]) => ({ id, version: 1, name: id, status: value })) as OperationResource[] };
    },
  },
  "feature-flags": { title: "Feature flags", load: weddingOsApi.platformFeatureFlags },
  privacy: {
    title: "Privacy & retention",
    load: async () => {
      const retention = await weddingOsApi.platformRetentionRuns();
      return {
        items: [
          ...retention.policies.map((policy) => ({
            ...policy,
            name: String(policy.key ?? policy.entityType ?? policy.id),
            status: policy.active === false ? "PAUSED" : "ACTIVE",
          })),
          ...retention.items,
        ] as OperationResource[],
      };
    },
  },
  backups: {
    title: "Backup-uri",
    load: async () => {
      const [runs, schedules] = await Promise.all([
        weddingOsApi.platformBackups(),
        weddingOsApi.platformBackupSchedules(),
      ]);
      return { items: [...schedules.items, ...runs.items] };
    },
  },
  restores: { title: "Restore-uri", load: weddingOsApi.platformRestores },
  releases: { title: "Release candidates", load: weddingOsApi.platformReleases },
} as const;

type SectionKey = keyof typeof sections;

export default function AdminSectionPage() {
  const { toast } = useToast();
  const route = useParams<{ section: string }>();
  const key = route.section as SectionKey;
  const definition = sections[key];
  const [items, setItems] = React.useState<OperationResource[]>([]);
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!definition) return;
    setLoading(true);
    setError(null);
    try {
      const response = await definition.load();
      setItems(response.items as OperationResource[]);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [definition]);

  React.useEffect(() => {
    if (!definition) return;
    let active = true;
    void definition
      .load()
      .then((response) => {
        if (!active) return;
        setItems(response.items as OperationResource[]);
        setError(null);
        setPage(0);
      })
      .catch((caught: unknown) => {
        if (active) setError(apiErrorMessage(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [definition]);

  const authorize = async (purpose: string) => {
    const password = window.prompt("Confirmă parola contului administrativ pentru step-up:");
    if (!password) return false;
    const challenge = await weddingOsApi.createAdminStepUp(purpose, password);
    const code = window.prompt("Introdu codul TOTP sau un recovery code:");
    if (!code) return false;
    await weddingOsApi.verifyAdminStepUp(challenge.challengeId, code.trim());
    return true;
  };

  const reason = (impact: string) => {
    if (!window.confirm(`Impact preview:\n\n${impact}\n\nContinui?`)) return null;
    const value = window.prompt("Motiv obligatoriu pentru audit (minimum 8 caractere):");
    return value && value.trim().length >= 8 ? value.trim() : null;
  };

  const changeStatus = async (item: OperationResource, scope: "user" | "workspace" | "vendor") => {
    const row = item as Record<string, unknown>;
    const suspended = String(row.status ?? row.state) === "SUSPENDED";
    const action = suspended ? "reactivate" : "suspend";
    const auditReason = reason(suspended ? "Accesul este reactivat; toate schimbările rămân auditate." : "Accesul este blocat imediat; sesiunile și operațiile active pot fi revocate.");
    if (!auditReason) return;
    setBusyId(item.id);
    try {
      const purpose = scope === "user" ? "USER_SUSPEND" : scope === "workspace" ? "WORKSPACE_SUSPEND" : "VENDOR_SUSPEND";
      if (!suspended && !(await authorize(purpose))) return;
      if (scope === "user") await weddingOsApi.changePlatformUserStatus(item.id, action, item.version, auditReason);
      else if (scope === "workspace") await weddingOsApi.changePlatformWorkspaceStatus(item.id, action, item.version, auditReason);
      else await weddingOsApi.changePlatformVendorStatus(item.id, action, item.version, auditReason);
      toast({ title: "Acțiune aplicată", description: "Versiunea, motivul și idempotency key au fost înregistrate în audit.", variant: "success" });
      await load();
    } catch (caught) {
      toast({ title: "Acțiune respinsă", description: apiErrorMessage(caught), variant: "error" });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const runRetention = async (item: OperationResource, mode: "DRY_RUN" | "EXECUTE") => {
    const impact = mode === "DRY_RUN" ? "Se calculează candidații; zero mutații." : "Înregistrările eligibile sunt șterse definitiv; legal holds sunt reverificate și păstrate.";
    const auditReason = reason(impact);
    if (!auditReason) return;
    setBusyId(`${item.id}:${mode}`);
    try {
      if (!(await authorize("RETENTION_EXECUTION"))) return;
      await weddingOsApi.runPlatformRetention(item.id, item.version, mode, auditReason);
      toast({ title: mode === "DRY_RUN" ? "Dry-run finalizat" : "Retention executat", description: "Rezultatul și checksum-ul dovezii sunt persistate în audit.", variant: "success" });
      await load();
    } catch (caught) {
      toast({ title: "Retention blocat", description: apiErrorMessage(caught), variant: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const toggleSchedule = async (item: OperationResource) => {
    const row = item as Record<string, unknown>;
    const enabled = row.enabled !== false;
    const auditReason = reason(enabled ? "Execuțiile viitoare sunt oprite; backup-urile existente rămân intacte." : "Programarea este reactivată folosind politica și destinația configurate.");
    if (!auditReason) return;
    setBusyId(item.id);
    try {
      if (!(await authorize("BACKUP_POLICY_CHANGE"))) return;
      await weddingOsApi.setPlatformBackupSchedule(item.id, !enabled, item.version, auditReason);
      toast({ title: enabled ? "Programare oprită" : "Programare reluată", description: "Modificarea este auditată și protejată prin versiune.", variant: "success" });
      await load();
    } catch (caught) {
      toast({ title: "Programarea nu a fost modificată", description: apiErrorMessage(caught), variant: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const createBackup = async () => {
    const auditReason = reason("Se creează un backup FULL asincron; operația nu suprascrie o copie existentă.");
    if (!auditReason) return;
    setBusyId("create-backup");
    try {
      await weddingOsApi.createPlatformBackup("FULL", auditReason);
      toast({ title: "Backup solicitat", description: "Jobul are idempotency key și va apărea în această pagină.", variant: "success" });
      await load();
    } catch (caught) {
      toast({ title: "Backup-ul nu a pornit", description: apiErrorMessage(caught), variant: "error" });
    } finally {
      setBusyId(null);
    }
  };

  if (!definition) {
    return <PortalShell role="Platform Admin" title="Rută administrativă necunoscută" subtitle="Secțiunea cerută nu există." backHref="/admin" backLabel="Control center"><Card><CardContent className="p-6">Selectează o secțiune validă din Control center.</CardContent></Card></PortalShell>;
  }

  const filtered = items.filter((item) => JSON.stringify(item).toLocaleLowerCase("ro-RO").includes(query.toLocaleLowerCase("ro-RO")));
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  return (
    <PortalShell role="Platform Admin" title={definition.title} subtitle="Date persistente prin API-ul administrativ, cu redacție și capabilități aplicate pe server." backHref="/admin" backLabel="Control center">
      <nav aria-label="Secțiuni administrative" className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {Object.entries(sections).map(([slug, item]) => <Link key={slug} href={`/admin/${slug}`} className={`inline-flex h-8 shrink-0 items-center rounded-lg px-3 text-[13px] font-medium transition-colors ${slug === key ? "bg-brand text-on-brand" : "border border-line bg-surface text-ink hover:bg-subtle"}`}>{item.title}</Link>)}
      </nav>

      <Card>
        <CardContent className="p-4.5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Input className="max-w-sm" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} icon={<Search className="size-4" />} placeholder="Filtrează rezultatele…" />
            <div className="flex items-center gap-2">{key === "backups" ? <Button size="sm" loading={busyId === "create-backup"} onClick={() => void createBackup()}>Backup FULL</Button> : null}<Badge variant="neutral">{filtered.length} rezultate</Badge><Button size="sm" variant="outline" loading={loading} onClick={() => void load()}><RefreshCw className="size-4" />Actualizează</Button></div>
          </div>

          {loading && !items.length ? <CardSkeleton lines={7} /> : error ? (
            <div className="rounded-lg border border-danger/20 bg-danger-soft p-4"><div className="flex gap-3"><AlertTriangle className="mt-0.5 size-5 text-danger" /><div><p className="font-semibold text-ink">Datele nu au putut fi încărcate</p><p className="mt-1 text-sm text-muted">{error}</p><Button className="mt-3" size="sm" variant="outline" onClick={() => void load()}>Reîncearcă</Button></div></div></div>
          ) : !visible.length ? (
            <div className="py-12 text-center"><ShieldCheck className="mx-auto size-8 text-faint" /><p className="mt-3 font-medium text-ink">Nu există rezultate</p><p className="mt-1 text-sm text-muted">Schimbă filtrul sau actualizează datele.</p></div>
          ) : (
            <Table minWidth="860px"><THead><TR><TH>Resursă</TH><TH>Identificator</TH><TH>Stare</TH><TH>Context audit</TH><TH align="right">Acțiuni</TH></TR></THead><TBody>{visible.map((item) => {
              const row = item as Record<string, unknown>;
              const label = String(row.name ?? row.title ?? row.email ?? row.key ?? row.subject ?? "Înregistrare");
              const status = String(row.status ?? row.state ?? "ACTIVE");
              const audit = String(row.updatedAt ?? row.createdAt ?? row.environment ?? "Persistat");
              const isPolicy = key === "privacy" && typeof row.entityType === "string";
              const isSchedule = key === "backups" && typeof row.cronExpression === "string";
              const scope = key === "users" ? "user" : key === "workspaces" ? "workspace" : key === "vendors" ? "vendor" : null;
              return <TR key={String(item.id)}><TD><p className="font-medium text-ink">{label}</p></TD><TD><span className="font-mono text-xs text-muted">{String(item.id)}</span></TD><TD><Badge variant={/FAILED|SUSPENDED|CRITICAL|ACTION_REQUIRED/.test(status) ? "danger" : /PENDING|OPEN|DEGRADED/.test(status) ? "warning" : "success"}>{status}</Badge></TD><TD className="text-xs text-muted">{audit}</TD><TD align="right"><div className="flex justify-end gap-2">{scope ? <Button size="sm" variant={status === "SUSPENDED" ? "outline" : "destructive-outline"} loading={busyId === item.id} onClick={() => void changeStatus(item, scope)}>{status === "SUSPENDED" ? "Reactivează" : "Suspendă"}</Button> : null}{isPolicy ? <><Button size="sm" variant="outline" loading={busyId === `${item.id}:DRY_RUN`} onClick={() => void runRetention(item, "DRY_RUN")}>Dry-run</Button><Button size="sm" variant="destructive-outline" loading={busyId === `${item.id}:EXECUTE`} onClick={() => void runRetention(item, "EXECUTE")}>Execută</Button></> : null}{isSchedule ? <Button size="sm" variant="outline" loading={busyId === item.id} onClick={() => void toggleSchedule(item)}>{row.enabled === false ? "Reia" : "Oprește"}</Button> : null}{!scope && !isPolicy && !isSchedule ? <span className="text-xs text-faint">Doar citire</span> : null}</div></TD></TR>;
            })}</TBody></Table>
          )}

          <div className="mt-4 flex items-center justify-between"><p className="text-xs text-muted">Pagina {page + 1} din {pages}</p><div className="flex gap-2"><Button size="icon-sm" variant="outline" aria-label="Pagina anterioară" disabled={page === 0} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="size-4" /></Button><Button size="icon-sm" variant="outline" aria-label="Pagina următoare" disabled={page + 1 >= pages} onClick={() => setPage((value) => value + 1)}><ChevronRight className="size-4" /></Button></div></div>
        </CardContent>
      </Card>
    </PortalShell>
  );
}
