"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clipboard,
  FlaskConical,
  RefreshCw,
  Send,
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
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useToast,
} from "@/components/ui";
import {
  apiErrorMessage,
  type BetaFeedbackResource,
  type BetaMetricsResource,
  type BetaParticipantResource,
  type OperationResource,
  weddingOsApi,
} from "@/lib/api/client";

type BetaAdminState = {
  programs: OperationResource[];
  cohorts: OperationResource[];
  participants: BetaParticipantResource[];
  invitations: OperationResource[];
  feedback: BetaFeedbackResource[];
  metrics: BetaMetricsResource;
  exit: {
    checks: Record<string, boolean>;
    passed: boolean;
    publicLaunchReady: false;
    verdict: string;
  };
};

export default function AdminBetaPage() {
  const { toast } = useToast();
  const [state, setState] = React.useState<BetaAdminState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [acceptanceToken, setAcceptanceToken] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [programs, cohorts, participants, invitations, feedback, metrics, exit] = await Promise.all([
        weddingOsApi.platformBetaPrograms(),
        weddingOsApi.platformBetaCohorts(),
        weddingOsApi.platformBetaParticipants(),
        weddingOsApi.platformBetaInvitations(),
        weddingOsApi.platformBetaFeedback(),
        weddingOsApi.platformBetaMetrics(),
        weddingOsApi.platformBetaExitCriteria(),
      ]);
      setState({ programs: programs.items, cohorts: cohorts.items, participants: participants.items, invitations: invitations.items, feedback: feedback.items, metrics, exit });
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

  const createProgram = async () => {
    const key = window.prompt("Cheie program (ex: controlled-beta-1):", "controlled-beta-1")?.trim();
    const name = window.prompt("Nume program:", "Sarbato Controlled Beta")?.trim();
    const releaseVersion = window.prompt("Release version:", "beta.1")?.trim();
    if (!key || !name || !releaseVersion) return;
    try {
      await weddingOsApi.createPlatformBetaProgram({ key, name, releaseVersion, status: "DRAFT" });
      toast({ title: "Program creat", description: "Programul este DRAFT până la închiderea criteriilor externe.", variant: "success" });
      await load();
    } catch (caught) {
      toast({ title: "Programul nu a fost creat", description: apiErrorMessage(caught), variant: "error" });
    }
  };

  const createCohort = async () => {
    const program = state?.programs[0];
    if (!program) return;
    const key = window.prompt("Cheie cohortă:", "pilot-operators")?.trim();
    const name = window.prompt("Nume cohortă:", "Pilot operators")?.trim();
    const description = window.prompt("Descriere operațională:", "Prima cohortă controlată pentru validarea fluxurilor end-to-end.")?.trim();
    if (!key || !name || !description) return;
    try {
      await weddingOsApi.createPlatformBetaCohort({ programId: program.id, key, name, description, targetCounts: { couples: 2, planners: 2, vendors: 2, testGuests: 4 } });
      toast({ title: "Cohortă creată", description: "Țintele sunt vizibile în metricile beta.", variant: "success" });
      await load();
    } catch (caught) {
      toast({ title: "Cohorta nu a fost creată", description: apiErrorMessage(caught), variant: "error" });
    }
  };

  const createInvitation = async () => {
    const program = state?.programs[0];
    const cohort = state?.cohorts[0];
    if (!program || !cohort) return;
    const email = window.prompt("Email participant (este persistat numai ca hash):")?.trim();
    if (!email) return;
    try {
      const created = await weddingOsApi.createPlatformBetaInvitation({ programId: program.id, cohortId: cohort.id, email, participantType: "COUPLE", expiresInHours: 72 });
      setAcceptanceToken(created.acceptanceToken);
      toast({
        title: "Invitație creată",
        description: created.acceptanceToken
          ? "Tokenul este afișat o singură dată și nu este stocat în clar."
          : "Cererea a fost reluată idempotent; tokenul nu este reafișat.",
        variant: "success",
      });
      await load();
    } catch (caught) {
      toast({ title: "Invitația nu a fost creată", description: apiErrorMessage(caught), variant: "error" });
    }
  };

  const triage = async (item: BetaFeedbackResource) => {
    const status = window.prompt("Stare nouă (TRIAGED, NEEDS_INFORMATION, PLANNED, IN_PROGRESS, RESOLVED, DECLINED, DUPLICATE):", "TRIAGED")?.trim().toUpperCase();
    const reason = window.prompt("Motiv pentru audit (minimum 8 caractere):")?.trim();
    if (!status || !reason || reason.length < 8) return;
    try {
      await weddingOsApi.triagePlatformBetaFeedback(item.id, item.version, { status, reason });
      toast({ title: "Feedback triat", description: "Istoricul și versiunea au fost actualizate.", variant: "success" });
      await load();
    } catch (caught) {
      toast({ title: "Trierea a fost respinsă", description: apiErrorMessage(caught), variant: "error" });
      await load();
    }
  };

  const removeParticipant = async (participant: BetaParticipantResource) => {
    if (!window.confirm("Revoci accesul beta pentru acest participant?")) return;
    const reason = window.prompt("Motiv pentru audit (minimum 8 caractere):")?.trim();
    if (!reason || reason.length < 8) return;
    try {
      await weddingOsApi.removePlatformBetaParticipant(participant.id, participant.version, reason);
      toast({ title: "Acces revocat", description: "Grantul participantului a fost revocat atomic.", variant: "success" });
      await load();
    } catch (caught) {
      toast({ title: "Accesul nu a fost revocat", description: apiErrorMessage(caught), variant: "error" });
      await load();
    }
  };

  if (loading && !state) return <PortalShell role="Platform Admin · Beta" title="Controlled Beta Operations" subtitle="Program, cohorte, invitații, feedback și criterii de ieșire." backHref="/admin" backLabel="Control center"><CardSkeleton lines={9} /></PortalShell>;

  if (error || !state) return <PortalShell role="Platform Admin · Beta" title="Controlled Beta Operations" subtitle="Accesul necesită capabilitatea platform.beta.read." backHref="/admin" backLabel="Control center"><Card><CardContent className="p-6"><div className="flex gap-3"><AlertTriangle className="size-5 text-danger" /><div><p className="font-semibold text-ink">Datele beta nu sunt disponibile</p><p className="mt-1 text-sm text-muted">{error}</p><Button className="mt-4" variant="outline" onClick={() => void load()}><RefreshCw className="size-4" /> Reîncearcă</Button></div></div></CardContent></Card></PortalShell>;

  const activeParticipants = state.metrics.participants.find((item) => item.status === "ACTIVE")?._count ?? 0;

  return (
    <PortalShell role="Platform Admin · Beta" title="Controlled Beta Operations" subtitle="Control factual al mediului beta; public launch rămâne separat și blocat." backHref="/admin" backLabel="Control center">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div className="flex gap-2"><Badge variant="warning" dot>{state.metrics.releaseVersion ?? "release neconfigurat"}</Badge><Badge variant={state.exit.passed ? "success" : "warning"}>{state.exit.verdict.replaceAll("_", " ")}</Badge><Badge variant="danger">PUBLIC LAUNCH NOT READY</Badge></div><Button size="sm" variant="outline" loading={loading} onClick={() => void load()}><RefreshCw className="size-4" /> Actualizează</Button></div>

      {acceptanceToken ? <Card className="mb-5 border-warning/30"><CardContent className="p-4.5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold text-ink">Token invitație, afișat o singură dată</p><code className="mt-1 block max-w-2xl break-all text-xs text-muted">{acceptanceToken}</code></div><Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/beta-invitation?token=${acceptanceToken}`)}><Clipboard className="size-4" /> Copiază linkul</Button></div></CardContent></Card> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[{ label: "Programe", value: state.programs.length, Icon: FlaskConical }, { label: "Cohorte", value: state.cohorts.length, Icon: Users }, { label: "Participanți activi", value: activeParticipants, Icon: CheckCircle2 }, { label: "Feedback deschis", value: state.feedback.filter((item) => !["RESOLVED", "DECLINED", "DUPLICATE"].includes(item.status)).length, Icon: AlertTriangle }].map(({ label, value, Icon }) => <Card key={label}><CardContent className="flex items-center gap-3 p-4.5"><span className="flex size-10 items-center justify-center rounded-lg bg-brand-soft text-brand"><Icon className="size-5" /></span><div><p className="text-xs text-muted">{label}</p><p className="text-xl font-semibold tabular-nums text-ink">{value}</p></div></CardContent></Card>)}
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Inițializare controlată</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex items-center justify-between rounded-lg bg-subtle p-3"><div><p className="text-sm font-medium text-ink">1. Program</p><p className="text-xs text-muted">Release și documente beta</p></div><Button size="sm" variant="outline" disabled={state.programs.length > 0} onClick={() => void createProgram()}>Creează</Button></div><div className="flex items-center justify-between rounded-lg bg-subtle p-3"><div><p className="text-sm font-medium text-ink">2. Cohortă</p><p className="text-xs text-muted">Ținte și fereastră de execuție</p></div><Button size="sm" variant="outline" disabled={!state.programs.length} onClick={() => void createCohort()}>Creează</Button></div><div className="flex items-center justify-between rounded-lg bg-subtle p-3"><div><p className="text-sm font-medium text-ink">3. Invitație</p><p className="text-xs text-muted">Email hash + token one-time</p></div><Button size="sm" disabled={!state.cohorts.length} onClick={() => void createInvitation()}><Send className="size-4" /> Invită</Button></div></CardContent></Card>
        <Card><CardHeader><CardTitle>Criterii de ieșire</CardTitle><Badge variant={state.exit.passed ? "success" : "warning"}>{Object.values(state.exit.checks).filter(Boolean).length}/{Object.keys(state.exit.checks).length}</Badge></CardHeader><CardContent className="space-y-2">{Object.entries(state.exit.checks).map(([key, passed]) => <div key={key} className="flex items-center justify-between rounded-lg bg-subtle px-3 py-2.5"><span className="text-sm text-ink">{key.replaceAll(/([A-Z])/g, " $1")}</span><Badge variant={passed ? "success" : "warning"}>{passed ? "Confirmat" : "Lipsește"}</Badge></div>)}</CardContent></Card>
      </div>

      <Card className="mt-5"><CardHeader><CardTitle>Participanți</CardTitle><Badge variant="neutral">{state.participants.length}</Badge></CardHeader><CardContent><Table minWidth="720px"><THead><TR><TH>Tip</TH><TH>Stare</TH><TH>Cohortă</TH><TH>Versiune</TH><TH align="right">Acțiune</TH></TR></THead><TBody>{state.participants.map((participant) => <TR key={participant.id}><TD>{participant.participantType}</TD><TD><Badge variant={participant.status === "ACTIVE" ? "success" : participant.status === "REMOVED" ? "danger" : "warning"}>{participant.status}</Badge></TD><TD><span className="font-mono text-xs text-muted">{participant.cohortId.slice(0, 8)}</span></TD><TD>{participant.version}</TD><TD align="right"><Button size="sm" variant="destructive-outline" disabled={participant.status === "REMOVED"} onClick={() => void removeParticipant(participant)}>Revocă</Button></TD></TR>)}</TBody></Table></CardContent></Card>

      <Card className="mt-5"><CardHeader><CardTitle>Coada de feedback</CardTitle><Badge variant="neutral">{state.feedback.length}</Badge></CardHeader><CardContent><Table minWidth="820px"><THead><TR><TH>Descriere</TH><TH>Tip</TH><TH>Severitate</TH><TH>Stare</TH><TH align="right">Acțiune</TH></TR></THead><TBody>{state.feedback.map((item) => <TR key={item.id}><TD><p className="max-w-sm truncate font-medium text-ink">{item.description}</p><p className="text-xs text-faint">{item.releaseVersion}</p></TD><TD>{item.type}</TD><TD><Badge variant={item.severity === "CRITICAL" ? "danger" : item.severity === "HIGH" ? "warning" : "neutral"}>{item.severity}</Badge></TD><TD>{item.status}</TD><TD align="right"><Button size="sm" variant="outline" onClick={() => void triage(item)}>Triază</Button></TD></TR>)}</TBody></Table></CardContent></Card>

      <Link href="/admin" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"><ArrowLeft className="size-4" /> Înapoi la Control center</Link>
    </PortalShell>
  );
}
