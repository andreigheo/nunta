"use client";

import * as React from "react";
import Image from "next/image";
import {
  Activity,
  AlertTriangle,
  Building2,
  Database,
  Gauge,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { PortalShell } from "@/components/portals/portal-shell";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardSkeleton,
  CardTitle,
  Input,
  Table,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useToast,
} from "@/components/ui";
import {
  apiErrorMessage,
  type OperationResource,
  type PlatformDashboardResource,
  type PlatformSystemStatusResource,
  type PlatformUserResource,
  weddingOsApi,
} from "@/lib/api/client";

type AdminState = {
  mfa: { required: boolean; enrolled: boolean; pendingEnrollmentId: string | null; recoveryCodesRemaining: number };
  dashboard: PlatformDashboardResource;
  system: PlatformSystemStatusResource;
  users: PlatformUserResource[];
  workspaces: OperationResource[];
  vendors: OperationResource[];
  support: OperationResource[];
  incidents: OperationResource[];
  alerts: OperationResource[];
  flags: OperationResource[];
  backups: OperationResource[];
  restores: OperationResource[];
  releases: OperationResource[];
};

const environmentLabel: Record<string, string> = {
  development: "Development",
  staging: "Staging",
  production: "Production",
};

export default function AdminPage() {
  const { toast } = useToast();
  const [state, setState] = React.useState<AdminState | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [enrollment, setEnrollment] = React.useState<{ enrollmentId: string; qrDataUrl: string; secret: string } | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mfa, dashboard, system, users, workspaces, vendors, support, incidents, alerts, flags, backups, restores, releases] = await Promise.all([
        weddingOsApi.mfaStatus(),
        weddingOsApi.platformDashboard(),
        weddingOsApi.platformSystemStatus(),
        weddingOsApi.platformUsers(),
        weddingOsApi.platformWorkspaces(),
        weddingOsApi.platformVendors(),
        weddingOsApi.platformSupportCases(),
        weddingOsApi.platformIncidents(),
        weddingOsApi.platformSecurityAlerts(),
        weddingOsApi.platformFeatureFlags(),
        weddingOsApi.platformBackups(),
        weddingOsApi.platformRestores(),
        weddingOsApi.platformReleases(),
      ]);
      setState({ mfa, dashboard, system, users: users.items, workspaces: workspaces.items, vendors: vendors.items, support: support.items, incidents: incidents.items, alerts: alerts.items, flags: flags.items, backups: backups.items, restores: restores.items, releases: releases.items });
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const changeUser = async (user: PlatformUserResource) => {
    const action = user.status === "SUSPENDED" ? "reactivate" : "suspend";
    const verb = action === "suspend" ? "suspendarea" : "reactivarea";
    const reason = window.prompt(`Motiv obligatoriu pentru ${verb} contului ${user.email}:`);
    if (!reason || reason.trim().length < 8) return;
    if (!window.confirm(`Confirmi ${verb} contului? Sesiunile active vor fi revocate la suspendare.`)) return;
    setBusyId(user.id);
    try {
      if (action === "suspend") {
        const password = window.prompt("Confirmă parola contului administrativ pentru step-up:");
        if (!password) return;
        const challenge = await weddingOsApi.createAdminStepUp("USER_SUSPEND", password);
        const code = window.prompt("Introdu codul TOTP sau un recovery code:");
        if (!code) return;
        await weddingOsApi.verifyAdminStepUp(challenge.challengeId, code.trim());
      }
      const updated = await weddingOsApi.changePlatformUserStatus(user.id, action, user.version, reason.trim());
      setState((current) => current ? { ...current, users: current.users.map((item) => item.id === updated.id ? updated : item) } : current);
      toast({ title: action === "suspend" ? "Cont suspendat" : "Cont reactivat", description: "Acțiunea a fost înregistrată în auditul platformei.", variant: "success" });
    } catch (caught) {
      toast({ title: "Acțiunea nu a fost aplicată", description: apiErrorMessage(caught), variant: "error" });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const startMfaEnrollment = async () => {
    try {
      const result = await weddingOsApi.enrollMfa();
      setEnrollment({ enrollmentId: result.enrollmentId, qrDataUrl: result.qrDataUrl, secret: result.secret });
    } catch (caught) {
      toast({ title: "Enrollment indisponibil", description: apiErrorMessage(caught), variant: "error" });
    }
  };

  const confirmMfaEnrollment = async () => {
    if (!enrollment) return;
    const code = window.prompt("Introdu codul de 6 cifre afișat de aplicația Authenticator:");
    if (!code) return;
    try {
      const result = await weddingOsApi.confirmMfa(enrollment.enrollmentId, code.trim());
      window.alert(`Salvează recovery codes acum. Ele sunt afișate o singură dată:\n\n${result.recoveryCodes.join("\n")}`);
      setEnrollment(null);
      await load();
    } catch (caught) {
      toast({ title: "Cod MFA invalid", description: apiErrorMessage(caught), variant: "error" });
    }
  };

  if (loading && !state) {
    return <PortalShell role="Platform Admin" title="Control center" subtitle="Date operaționale reale, izolate prin capabilități de platformă." backHref="/sign-in" backLabel="Ieșire"><CardSkeleton lines={8} /></PortalShell>;
  }

  if (error || !state) {
    return (
      <PortalShell role="Platform Admin" title="Acces administrativ" subtitle="Această zonă necesită un grant activ pentru mediul curent." backHref="/sign-in" backLabel="Ieșire">
        <Card><CardContent className="p-6"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 size-5 text-danger" /><div><p className="font-semibold text-ink">Acces refuzat sau serviciu indisponibil</p><p className="mt-1 text-sm text-muted">{error ?? "Datele administrative nu sunt disponibile."}</p><Button className="mt-4" variant="outline" onClick={() => void load()}><RefreshCw className="size-4" />Reîncearcă</Button></div></div></CardContent></Card>
      </PortalShell>
    );
  }

  const users = state.users.filter((user) => `${user.email} ${user.profile?.firstName ?? ""} ${user.profile?.lastName ?? ""}`.toLocaleLowerCase("ro-RO").includes(query.toLocaleLowerCase("ro-RO")));
  const readiness = state.dashboard.productionReadiness;

  return (
    <PortalShell
      role="Platform Admin"
      title="Control center"
      subtitle="Administrare, privacy, securitate și operare pe date persistente."
      backHref="/sign-in"
      backLabel="Ieșire"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><Badge variant="info">{environmentLabel[state.dashboard.environment] ?? state.dashboard.environment}</Badge><Badge variant={state.system.status === "OPERATIONAL" ? "success" : "warning"} dot>{state.system.status}</Badge><Badge variant="warning">{readiness.verdict.replaceAll("_", " ")}</Badge></div>
        <Button variant="outline" size="sm" loading={loading} onClick={() => void load()}><RefreshCw className="size-4" />Actualizează</Button>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Utilizatori", value: state.dashboard.counts.users, Icon: Users, tone: "bg-info-soft text-info" },
          { label: "Workspaces", value: state.dashboard.counts.workspaces, Icon: Activity, tone: "bg-brand-soft text-brand" },
          { label: "Organizații vendor", value: state.dashboard.counts.vendors, Icon: Building2, tone: "bg-warning-soft text-warning" },
          { label: "Alerte deschise", value: state.dashboard.counts.alertsOpen, Icon: ShieldCheck, tone: "bg-danger-soft text-danger" },
        ].map(({ label, value, Icon, tone }) => (
          <Card key={label}><CardContent className="flex items-center gap-3 p-4.5"><span className={`flex size-10 items-center justify-center rounded-lg ${tone}`}><Icon className="size-5" /></span><div><p className="text-xs text-muted">{label}</p><p className="text-xl font-semibold tabular-nums text-ink">{value}</p></div></CardContent></Card>
        ))}
      </section>

      {state.mfa.required && !state.mfa.enrolled ? <Card className="mt-5 border-warning/30"><CardContent className="flex flex-wrap items-center justify-between gap-4 p-4.5"><div><p className="font-semibold text-ink">MFA este obligatoriu pentru rolul tău</p><p className="mt-1 text-sm text-muted">Operațiile critice rămân blocate până confirmi TOTP și salvezi recovery codes.</p></div><Button onClick={() => void startMfaEnrollment()}>Configurează MFA</Button>{enrollment ? <div className="w-full rounded-lg bg-subtle p-4"><div className="flex flex-wrap items-center gap-4"><Image unoptimized width={160} height={160} src={enrollment.qrDataUrl} alt="Cod QR pentru configurarea TOTP" className="size-40 rounded-lg bg-white p-2" /><div><p className="text-xs text-muted">Cheie manuală (afișată numai în enrollment)</p><code className="mt-1 block break-all text-xs text-ink">{enrollment.secret}</code><Button className="mt-3" size="sm" onClick={() => void confirmMfaEnrollment()}>Confirmă codul TOTP</Button></div></div></div> : null}</CardContent></Card> : state.mfa.enrolled ? <div className="mt-5 flex items-center gap-2 rounded-lg border border-success/20 bg-success-soft px-4 py-3 text-sm text-ink"><ShieldCheck className="size-4 text-success" />MFA activ · {state.mfa.recoveryCodesRemaining} recovery codes disponibile</div> : null}

      <Tabs defaultValue="overview" className="mt-6">
        <TabsList>
          <TabsTrigger value="overview">Operațiuni</TabsTrigger>
          <TabsTrigger value="users">Utilizatori</TabsTrigger>
          <TabsTrigger value="privacy">Privacy</TabsTrigger>
          <TabsTrigger value="delivery">Backup & release</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-5 grid gap-5 lg:grid-cols-2">
          <Card><CardHeader><CardTitle>Starea serviciilor</CardTitle><Gauge className="size-4 text-success" /></CardHeader><CardContent className="space-y-3">{Object.entries(state.system.services).map(([name, service]) => <div key={name} className="flex items-center justify-between rounded-lg bg-subtle px-3 py-2.5"><span className="text-sm font-medium capitalize text-ink">{name}</span><Badge variant={service.status === "UP" ? "success" : "warning"} dot>{service.status}</Badge></div>)}</CardContent></Card>
          <Card><CardHeader><CardTitle>Providers configurați</CardTitle><Database className="size-4 text-faint" /></CardHeader><CardContent className="space-y-3">{Object.entries(state.system.providers).map(([name, value]) => <div key={name} className="flex items-center justify-between border-b border-line pb-2.5 last:border-0"><span className="text-sm capitalize text-muted">{name}</span><Badge variant={value === "fake" ? "warning" : "neutral"}>{value}</Badge></div>)}</CardContent></Card>
          <Card className="lg:col-span-2"><CardHeader><CardTitle>Launch gate factual</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Object.entries(readiness).filter(([key]) => key !== "verdict").map(([key, value]) => <div key={key} className="rounded-lg bg-subtle p-3"><p className="text-xs text-muted">{key.replaceAll(/([A-Z])/g, " $1")}</p><Badge className="mt-2" variant={value ? "success" : "warning"}>{value ? "Confirmat" : "Lipsește"}</Badge></div>)}</CardContent></Card>
        </TabsContent>

        <TabsContent value="users" className="mt-5">
          <div className="mb-4 max-w-sm"><Input value={query} onChange={(event) => setQuery(event.target.value)} icon={<Search className="size-4" />} placeholder="Caută utilizator…" /></div>
          <Table minWidth="760px"><THead><TR><TH>Utilizator</TH><TH>Stare</TH><TH>Workspaces</TH><TH>Sesiuni</TH><TH align="right">Acțiune</TH></TR></THead><TBody>{users.map((user) => <TR key={user.id}><TD><p className="font-medium">{[user.profile?.firstName, user.profile?.lastName].filter(Boolean).join(" ") || "Fără nume"}</p><p className="text-xs text-muted">{user.email}</p></TD><TD><Badge variant={user.status === "ACTIVE" ? "success" : "danger"}>{user.status}</Badge></TD><TD>{user.membershipCount}</TD><TD>{user.sessionCount}</TD><TD align="right"><Button size="sm" variant={user.status === "ACTIVE" ? "destructive-outline" : "outline"} loading={busyId === user.id} onClick={() => void changeUser(user)}>{user.status === "ACTIVE" ? "Suspendă" : "Reactivează"}</Button></TD></TR>)}</TBody></Table>
        </TabsContent>

        <TabsContent value="privacy" className="mt-5 grid gap-4 sm:grid-cols-3">
          <SummaryCard title="Cereri active" value={state.support.length} detail="Support și privacy sunt procesate separat, cu audit." />
          <SummaryCard title="Incidente" value={state.incidents.length} detail="Evenimente operaționale persistente, fără payload-uri brute." />
          <SummaryCard title="Alerte securitate" value={state.alerts.length} detail="Alertele sunt deduplicate și vizibile numai rolurilor autorizate." />
        </TabsContent>

        <TabsContent value="delivery" className="mt-5 grid gap-4 sm:grid-cols-3">
          <SummaryCard title="Backup-uri" value={state.backups.length} detail={state.backups.length ? "Există evidențe persistente." : "Niciun backup verificat încă."} />
          <SummaryCard title="Restore-uri" value={state.restores.length} detail={state.restores.length ? "Există validări de restore." : "Restore-ul nu a fost demonstrat încă."} />
          <SummaryCard title="Release candidates" value={state.releases.length} detail={readiness.verdict.replaceAll("_", " ")} />
        </TabsContent>
      </Tabs>
    </PortalShell>
  );
}

function SummaryCard({ title, value, detail }: { title: string; value: number; detail: string }) {
  return <Card><CardContent className="p-4.5"><p className="text-xs text-muted">{title}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</p><p className="mt-2 text-xs leading-relaxed text-faint">{detail}</p></CardContent></Card>;
}
