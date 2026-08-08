"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  ExternalLink,
  LifeBuoy,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardSkeleton,
  CardTitle,
  Checkbox,
  Field,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import {
  apiErrorMessage,
  type BetaFeedbackResource,
  type BetaStatusResource,
  weddingOsApi,
} from "@/lib/api/client";

const checklistLabels: Record<string, string> = {
  profileReviewed: "Am verificat profilul și datele de contact",
  sandboxAcknowledged: "Înțeleg că plățile și providerii sunt în sandbox",
  supportPathReviewed: "Știu cum contactez echipa de suport beta",
  feedbackPathReviewed: "Știu cum raportez feedback și blocaje",
};

const emptyFeedback = {
  type: "BUG",
  severity: "MEDIUM",
  description: "",
  expectedBehavior: "",
  actualBehavior: "",
};

export default function BetaCenterPage() {
  const { toast } = useToast();
  const [status, setStatus] = React.useState<BetaStatusResource | null>(null);
  const [feedback, setFeedback] = React.useState<BetaFeedbackResource[]>([]);
  const [form, setForm] = React.useState(emptyFeedback);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const betaStatus = await weddingOsApi.betaStatus();
      setStatus(betaStatus);
      if (betaStatus.betaAccess) {
        setFeedback((await weddingOsApi.betaFeedback()).items);
      }
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

  const updateChecklist = async (key: string, value: boolean) => {
    if (!status?.participant) return;
    const checklist = {
      profileReviewed: false,
      sandboxAcknowledged: false,
      supportPathReviewed: false,
      feedbackPathReviewed: false,
      ...status.participant.onboardingChecklist,
      [key]: value,
    };
    setSaving(true);
    try {
      const participant = await weddingOsApi.updateBetaOnboarding(
        status.participant.version,
        checklist,
      );
      setStatus((current) =>
        current ? { ...current, participant, betaAccess: true } : current,
      );
      toast({
        title: participant.status === "ACTIVE" ? "Onboarding finalizat" : "Progres salvat",
        description: "Checklist-ul beta este persistat și protejat prin versiune.",
        variant: "success",
      });
    } catch (caught) {
      toast({
        title: "Progresul nu a fost salvat",
        description: apiErrorMessage(caught),
        variant: "error",
      });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const submitFeedback = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const item = await weddingOsApi.createBetaFeedback({
        ...form,
        currentRoute: window.location.pathname,
        browserMetadata: {
          browserFamily: navigator.userAgent.includes("Chrome") ? "Chromium" : "Other",
          deviceClass: window.innerWidth < 768 ? "mobile" : "desktop",
          viewport: { width: window.innerWidth, height: window.innerHeight },
          locale: navigator.language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        correlationId: null,
      });
      setFeedback((items) => [item, ...items]);
      setForm(emptyFeedback);
      toast({
        title: "Feedback înregistrat",
        description: `Referință ${item.id.slice(0, 8)} · echipa beta vede starea și severitatea.`,
        variant: "success",
      });
    } catch (caught) {
      toast({
        title: "Feedback-ul nu a fost trimis",
        description: apiErrorMessage(caught),
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading && !status) return <CardSkeleton lines={8} />;

  if (error || !status) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 text-danger" />
            <div>
              <p className="font-semibold text-ink">Centrul beta nu este disponibil</p>
              <p className="mt-1 text-sm text-muted">{error}</p>
              <Button className="mt-4" variant="outline" onClick={() => void load()}>
                <RefreshCw className="size-4" /> Reîncearcă
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!status.betaAccess || !status.participant) {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardContent className="p-7 text-center">
          <ShieldCheck className="mx-auto size-8 text-brand" />
          <h2 className="mt-4 font-brand text-2xl font-semibold text-ink">Program beta pe bază de invitație</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted">
            Contul tău nu are un grant beta activ. Folosește linkul securizat primit de la operatorul programului.
          </p>
          <Link className="mt-5 inline-flex h-10 items-center justify-center rounded-lg bg-brand px-4 text-sm font-medium text-on-brand shadow-card transition-colors hover:bg-brand-strong" href="/beta-invitation">Acceptă o invitație</Link>
        </CardContent>
      </Card>
    );
  }

  const checklist = {
    profileReviewed: false,
    sandboxAcknowledged: false,
    supportPathReviewed: false,
    feedbackPathReviewed: false,
    ...status.participant.onboardingChecklist,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-brand text-2xl font-semibold tracking-tight text-ink">Centrul Beta</h2>
            <Badge variant="warning" dot>{status.releaseVersion ?? "Beta"}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted">Mediu {status.environment} · tranzacții și provideri marcați sandbox.</p>
        </div>
        <div className="flex gap-2">
          <Link className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink transition-colors hover:bg-subtle" href="/beta/known-issues"><Bug className="size-4" /> Probleme cunoscute</Link>
          <Link className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink transition-colors hover:bg-subtle" href="/settings"><LifeBuoy className="size-4" /> Suport</Link>
        </div>
      </div>

      <Card className="border-warning/30">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4.5">
          <div><p className="font-semibold text-ink">Mediu controlat · nu este producție publică</p><p className="mt-1 text-sm text-muted">Nu introduce date de card reale și raportează imediat orice problemă de securitate sau date.</p></div>
          <Badge variant="warning">SANDBOX</Badge>
        </CardContent>
      </Card>

      {status.participant.status === "ONBOARDING" ? (
        <Card>
          <CardHeader><CardTitle>Onboarding beta</CardTitle><Badge variant="info">{Object.values(checklist).filter(Boolean).length}/4</Badge></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {Object.entries(checklistLabels).map(([key, label]) => (
              <div key={key} className="rounded-lg border border-line p-3">
                <Checkbox checked={checklist[key as keyof typeof checklist]} disabled={saving} label={label} onCheckedChange={(checked) => void updateChecklist(key, checked)} />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success-soft px-4 py-3 text-sm text-ink"><CheckCircle2 className="size-4 text-success" /> Onboarding finalizat · acces beta activ</div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader><CardTitle>Trimite feedback</CardTitle><Bug className="size-4 text-faint" /></CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submitFeedback}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Tip" required><Select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}><option value="BUG">Bug</option><option value="CONFUSION">Confuzie</option><option value="MISSING_FEATURE">Funcție lipsă</option><option value="PERFORMANCE">Performanță</option><option value="DESIGN">Design</option><option value="DATA_PROBLEM">Problemă de date</option><option value="SECURITY_CONCERN">Securitate</option><option value="OTHER">Altceva</option></Select></Field>
                <Field label="Severitate" required><Select value={form.severity} onChange={(event) => setForm((current) => ({ ...current, severity: event.target.value }))}><option value="LOW">Scăzută</option><option value="MEDIUM">Medie</option><option value="HIGH">Ridicată</option><option value="CRITICAL">Critică</option></Select></Field>
              </div>
              <Field label="Ce s-a întâmplat?" required><Textarea required minLength={8} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></Field>
              <Field label="La ce te așteptai?" required><Textarea required minLength={3} value={form.expectedBehavior} onChange={(event) => setForm((current) => ({ ...current, expectedBehavior: event.target.value }))} /></Field>
              <Field label="Ce ai observat în realitate?" required><Textarea required minLength={3} value={form.actualBehavior} onChange={(event) => setForm((current) => ({ ...current, actualBehavior: event.target.value }))} /></Field>
              <div className="flex items-center justify-between gap-3"><p className="text-xs text-faint">Trimitem ruta și metadata tehnică limitată, nu conținutul paginii.</p><Button type="submit" loading={saving}>Trimite</Button></div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Feedback-ul tău</CardTitle><Badge variant="neutral">{feedback.length}</Badge></CardHeader>
          <CardContent className="space-y-3">
            {feedback.length ? feedback.map((item) => (
              <Link key={item.id} href={`/beta/feedback/${item.id}`} className="block rounded-lg border border-line p-3 transition-colors hover:bg-subtle">
                <div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-medium text-ink">{item.description}</p><Badge variant={item.severity === "CRITICAL" ? "danger" : item.severity === "HIGH" ? "warning" : "neutral"}>{item.severity}</Badge></div>
                <div className="mt-2 flex items-center justify-between text-xs text-faint"><span>{item.status.replaceAll("_", " ")}</span><span className="inline-flex items-center gap-1">Detalii <ExternalLink className="size-3" /></span></div>
              </Link>
            )) : <p className="py-8 text-center text-sm text-muted">Nu ai trimis feedback încă.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
