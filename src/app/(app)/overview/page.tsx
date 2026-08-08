"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { PlanningDashboard } from "@weddingos/contracts";
import {
  AlertTriangle,
  Armchair,
  ArrowRight,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  BedDouble,
  Bus,
  Clock,
  CreditCard,
  FileText,
  ListChecks,
  MapPin,
  Mail,
  MailOpen,
  Plus,
  Sparkles,
  Store,
  Users,
  Utensils,
  Wallet,
} from "lucide-react";
import { weddingOsApi, apiErrorMessage } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import { tasks as demoTasks } from "@/lib/data/tasks";
import { upcomingEvents } from "@/lib/data/wedding";
import { daysUntil, formatDateLong, formatDateShort } from "@/lib/utils";
import { useShell } from "@/components/shell/shell-context";
import { EventThread } from "@/components/shell/event-thread";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  PageHeader,
  Progress,
  StatCard,
} from "@/components/ui";

type WeddingDayMetrics = {
  planId: string | null;
  status: string | null;
  momentsCompleted: number;
  momentsDelayed: number;
  criticalBlockedMoments: number;
  openIncidents: number;
  criticalIncidents: number;
  checkedInGuests: number;
  expectedGuests: number;
  notArrivedGuests: number;
  deniedGuests: number;
  activeAnnouncements: number;
  pendingMediaModeration: number;
};
type OverviewDashboard = PlanningDashboard & {
  weddingDay?: WeddingDayMetrics;
  risks?: {
    active: number;
    critical: number;
    high: number;
    top: Array<{ id: string; title: string; score: number; level: string }>;
  };
  intelligence?: {
    copilot: {
      openProposals: number;
      proposalsNeedingApproval: number;
      failedRuns: number;
    };
    contingency: {
      readyPlans: number;
      activePlans: number;
      recommendedActivations: number;
    };
    automations: {
      active: number;
      awaitingApproval: number;
      failedExecutions: number;
    };
  };
};

function demoDashboard(
  title: string,
  date: string | null,
  location: string | null,
): PlanningDashboard {
  const completed = demoTasks.filter(
    (task) => task.status === "completed",
  ).length;
  const overdue = demoTasks.filter(
    (task) => task.status !== "completed" && daysUntil(task.deadline) < 0,
  ).length;
  const urgent = demoTasks
    .filter((task) => task.priority === "urgent" || task.priority === "high")
    .slice(0, 5);
  return {
    wedding: {
      title,
      date,
      location,
      countdownDays: date ? daysUntil(date) : null,
    },
    planning: {
      totalTasks: demoTasks.length,
      completedTasks: completed,
      progressPercent: demoTasks.length
        ? Math.round((completed / demoTasks.length) * 100)
        : 0,
      overdueTasks: overdue,
      blockedTasks: demoTasks.filter((task) => task.status === "blocked")
        .length,
      dueThisWeek: demoTasks.filter(
        (task) =>
          daysUntil(task.deadline) >= 0 && daysUntil(task.deadline) <= 7,
      ).length,
    },
    nextBestAction: urgent[0]
      ? {
          type: "task",
          title: urgent[0].title,
          reason: "Este cea mai urgentă sarcină disponibilă din planul demo.",
          impact: "Menține faza curentă în grafic.",
          taskId: undefined,
          dueAt: new Date(urgent[0].deadline).toISOString(),
          priority: urgent[0].priority,
        }
      : null,
    urgentTasks: urgent.map((task) => ({
      id: crypto.randomUUID(),
      parentTaskId: null,
      phaseId: null,
      milestoneId: null,
      title: task.title,
      description: task.description ?? null,
      category: task.category,
      status: task.status.replaceAll("-", "_") as
        "not_started" | "in_progress" | "waiting" | "blocked" | "completed",
      priority: task.priority,
      startAt: task.startDate ? new Date(task.startDate).toISOString() : null,
      dueAt: new Date(task.deadline).toISOString(),
      relativeStartOffsetDays: null,
      relativeDueOffsetDays: null,
      assigneeMembershipId: null,
      assigneeName: task.owner,
      blockedReason: null,
      completedAt: null,
      estimatedEffortMinutes: null,
      isPrivate: false,
      position: 0,
      subtaskTotal: task.subtasks?.length ?? 0,
      subtaskCompleted: task.subtasks?.filter((item) => item.done).length ?? 0,
      dependencyCount: task.dependsOn ? 1 : 0,
      commentCount: task.comments,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
    upcomingDates: upcomingEvents.slice(0, 5).map((event) => ({
      id: event.id,
      sourceType: "native_event",
      sourceId: crypto.randomUUID(),
      title: event.title,
      description: null,
      startAt: new Date(event.date).toISOString(),
      endAt: null,
      allDay: true,
      timezone: "Europe/Bucharest",
      location: event.location ?? null,
      editable: true,
      href: "/calendar",
      version: 1,
    })),
    phases: [],
    recentActivity: [],
    guestCrm: {
      estimatedGuests: 120,
      activeGuests: 6,
      invited: 4,
      opened: 3,
      confirmed: 2,
      declined: 1,
      noResponse: 3,
      rsvpDeadline: null,
      menuIncomplete: 1,
      allergyIssues: 0,
      transportRequests: 1,
      accommodationRequests: 1,
    },
    operations: {
      seating: {
        plans: 1,
        eligibleGuests: 2,
        assignedGuests: 0,
        unassignedGuests: 2,
        openIssues: 0,
      },
      transport: {
        requests: 1,
        assignedGuests: 0,
        routes: 0,
        seatsAvailable: 0,
        openIssues: 0,
      },
      accommodation: {
        requests: 1,
        assignedGuests: 0,
        rooms: 0,
        bedsAvailable: 0,
        openIssues: 0,
      },
    },
    commercial: {
      currency: "RON",
      budget: {
        configured: true,
        targetTotalMinor: 120_000_00,
        estimatedMinor: 92_000_00,
        committedMinor: 45_000_00,
        paidMinor: 15_000_00,
      },
      payments: { scheduled: 2, overdue: 0, recordedMinor: 15_000_00 },
      procurement: {
        rfqs: { sent: 2 },
        offers: { submitted: 3 },
        bookings: { confirmed: 1 },
        contracts: { acknowledged: 1 },
      },
    },
    documents: {
      processing: 1,
      quarantined: 0,
      contractsAwaitingSignature: 1,
      signatureEnvelopesInProgress: 1,
      signatureEnvelopesFailed: 0,
    },
    onlinePayments: {
      openCheckouts: 1,
      capturedThisMonthMinor: 15_000_00,
      failedPayments: 0,
      refundsProcessingMinor: 0,
      disputedPayments: 0,
      currency: "RON",
    },
    unavailableModules: {
      budget: false,
      vendors: false,
      payments: false,
      risks: true,
    },
  };
}

export default function OverviewPage() {
  const router = useRouter();
  const shell = useShell();
  const { currentWorkspace, demoMode } = useWorkspace();
  const [dashboard, setDashboard] = React.useState<OverviewDashboard | null>(
    null,
  );
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const load = React.useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    setError("");
    try {
      setDashboard(
        demoMode
          ? demoDashboard(
              currentWorkspace.title,
              currentWorkspace.weddingDate,
              currentWorkspace.location,
            )
          : await weddingOsApi.dashboard(currentWorkspace.id),
      );
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace, demoMode]);
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  React.useEffect(() => {
    const refresh = () => {
      void load();
    };
    window.addEventListener("weddingos:planning-changed", refresh);
    return () =>
      window.removeEventListener("weddingos:planning-changed", refresh);
  }, [load]);

  if (!currentWorkspace || loading)
    return (
      <div className="mx-auto max-w-7xl">
        <div className="h-64 animate-pulse rounded-xl bg-subtle" />
      </div>
    );
  if (error || !dashboard)
    return (
      <ErrorState
        title="Prezentarea generală nu este disponibilă"
        description={
          error || "Datele tabloului de bord nu au putut fi încărcate."
        }
        onRetry={() => void load()}
      />
    );
  const { wedding, planning, nextBestAction } = dashboard;
  const weddingDay = dashboard.weddingDay;
  const money = (minor: number) =>
    new Intl.NumberFormat("ro-RO", {
      style: "currency",
      currency: dashboard.commercial.currency,
      maximumFractionDigits: 0,
    }).format(minor / 100);
  const countStatuses = (statuses: Record<string, number>) =>
    Object.values(statuses).reduce((total, count) => total + count, 0);

  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl space-y-5">
      <PageHeader
        title={wedding.title}
        description={
          <span className="flex flex-wrap items-center gap-3">
            {wedding.date && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-4" />
                {formatDateLong(wedding.date)}
              </span>
            )}
            {wedding.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4" />
                {wedding.location}
              </span>
            )}
          </span>
        }
        meta={
          wedding.countdownDays !== null &&
          wedding.countdownDays !== undefined ? (
            <Badge variant="brand" dot>
              {wedding.countdownDays} zile până la eveniment
            </Badge>
          ) : (
            <Badge variant="warning">Dată flexibilă</Badge>
          )
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => shell.setQuickCreate("event")}
            >
              <CalendarDays className="size-4" />
              Eveniment
            </Button>
            <Button size="sm" onClick={() => shell.setQuickCreate("task")}>
              <Plus className="size-4" />
              Sarcină
            </Button>
          </>
        }
      />

      <EventThread
        items={[
          {
            label: "Plan",
            value: `${Math.round(planning.progressPercent)}% finalizat`,
            href: "/plan",
            icon: ListChecks,
            tone: "brand",
          },
          {
            label: "Invitație",
            value: `${dashboard.guestCrm.invited} trimise`,
            href: "/invitations",
            icon: Mail,
            tone: "accent",
          },
          {
            label: "RSVP",
            value: `${dashboard.guestCrm.confirmed} confirmate`,
            href: "/rsvp",
            icon: Users,
            tone: "sun",
          },
          {
            label: "Logistică",
            value: `${dashboard.operations.seating.assignedGuests}/${dashboard.operations.seating.eligibleGuests} locuri`,
            href: "/seating",
            icon: Bus,
            tone: "success",
          },
          {
            label: "Furnizori",
            value: `${countStatuses(dashboard.commercial.procurement.offers)} oferte`,
            href: "/offers",
            icon: Store,
            tone: "brand",
          },
          {
            label: "Buget",
            value: `${money(dashboard.commercial.budget.committedMinor)} angajat`,
            href: "/budget",
            icon: Wallet,
            tone: "accent",
          },
          {
            label: "Ziua evenimentului",
            value: weddingDay?.status
              ? weddingDay.status.toLowerCase().replaceAll("_", " ")
              : "De configurat",
            href: "/wedding-day",
            icon: CalendarCheck2,
            tone: "success",
          },
        ]}
      />

      {nextBestAction ? (
        <section className="overflow-hidden rounded-2xl bg-brand text-on-brand shadow-pop" aria-labelledby="next-action-title">
          <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:p-7">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent text-white">
              <Sparkles className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="next-action-title" className="font-brand text-2xl font-semibold leading-tight tracking-[-0.02em] text-on-brand">
                  {nextBestAction.title}
                </h2>
                <Badge
                  variant={
                    nextBestAction.priority === "urgent" ? "danger" : "warning"
                  }
                >
                  Acțiunea recomandată
                </Badge>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-on-brand/80">
                {nextBestAction.reason}
              </p>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-on-brand/65">
                {nextBestAction.dueAt && (
                  <span>
                    Termen:{" "}
                    <strong className="text-on-brand">
                      {formatDateShort(nextBestAction.dueAt)}
                    </strong>
                  </span>
                )}
                <span>
                  Impact:{" "}
                  <strong className="text-on-brand">
                    {nextBestAction.impact}
                  </strong>
                </span>
              </div>
            </div>
            <Button
              variant="outline"
              className="border-white/20 bg-white text-brand hover:border-white hover:bg-brand-soft"
              onClick={() =>
                router.push(
                  nextBestAction.href ??
                    (nextBestAction.taskId ? "/plan" : "/overview"),
                )
              }
            >
              Deschide
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </section>
      ) : (
        <EmptyState
          icon={Sparkles}
          title="Nu există încă o acțiune recomandată"
          description="Generează planul sau adaugă o sarcină pentru a activa recomandările."
          action={{
            label: "Deschide planul",
            onClick: () => router.push("/plan"),
          }}
        />
      )}

      {weddingDay ? (
        <Card
          className={
            weddingDay.criticalIncidents || weddingDay.criticalBlockedMoments
              ? "border-danger/35"
              : "border-brand/25"
          }
        >
          <CardHeader>
            <div>
              <CardTitle>Centrul operațional al evenimentului</CardTitle>
              <p className="mt-0.5 text-[13px] text-muted">
                Stare operațională reală · plan{" "}
                {weddingDay.status?.toLowerCase().replaceAll("_", " ") ??
                  "neconfigurat"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/wedding-day")}
            >
              Deschide centrul
              <ArrowRight className="size-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Momente finalizate"
              value={weddingDay.momentsCompleted}
              hint={`${weddingDay.momentsDelayed} întârziate`}
              icon={CheckCircle2}
              tone={weddingDay.momentsDelayed ? "warning" : "default"}
              href="/wedding-day"
            />
            <StatCard
              label="Incidente deschise"
              value={weddingDay.openIncidents}
              hint={`${weddingDay.criticalIncidents} critice`}
              icon={AlertTriangle}
              tone={
                weddingDay.criticalIncidents
                  ? "danger"
                  : weddingDay.openIncidents
                    ? "warning"
                    : "default"
              }
              href="/wedding-day"
            />
            <StatCard
              label="Check-in"
              value={`${weddingDay.checkedInGuests}/${weddingDay.expectedGuests}`}
              hint={`${weddingDay.notArrivedGuests} nu au sosit`}
              icon={Users}
              href="/wedding-day"
            />
            <StatCard
              label="Media de verificat"
              value={weddingDay.pendingMediaModeration}
              hint={`${weddingDay.activeAnnouncements} anunțuri active`}
              icon={MailOpen}
              tone={weddingDay.pendingMediaModeration ? "warning" : "default"}
              href="/moments"
            />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Progres plan"
          value={`${Math.round(planning.progressPercent)}%`}
          hint={`${planning.completedTasks} din ${planning.totalTasks} sarcini finalizate`}
          icon={CheckCircle2}
          href="/plan"
          footer={
            <Progress
              value={planning.progressPercent}
              className="mt-3"
              aria-label="Progresul planului"
            />
          }
        />
        <StatCard
          label="Sarcini restante"
          value={planning.overdueTasks}
          hint="Necesită atenție"
          icon={AlertTriangle}
          tone={planning.overdueTasks ? "danger" : "default"}
          href="/plan"
        />
        <StatCard
          label="Blocate"
          value={planning.blockedTasks}
          hint="Pot bloca alte sarcini"
          icon={ListChecks}
          tone={planning.blockedTasks ? "warning" : "default"}
          href="/plan"
        />
        <StatCard
          label="Scad săptămâna aceasta"
          value={planning.dueThisWeek}
          hint="Următoarele 7 zile"
          icon={Clock}
          href="/calendar"
        />
      </div>

      {dashboard.risks ? (
        <Card
          className={
            dashboard.risks.critical ? "border-danger/35" : "border-line"
          }
        >
          <CardHeader>
            <div>
              <CardTitle>Riscuri și Plan B</CardTitle>
              <p className="mt-0.5 text-[13px] text-muted">
                {dashboard.risks.active} riscuri active ·{" "}
                {dashboard.risks.critical} critice · {dashboard.risks.high}{" "}
                ridicate
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/risks")}
            >
              Deschide registrul <ArrowRight className="size-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            {dashboard.intelligence ? (
              <div className="mb-4 flex flex-wrap gap-2 text-xs text-muted">
                <Badge variant="neutral">
                  {dashboard.intelligence.copilot.proposalsNeedingApproval} propuneri de aprobat
                </Badge>
                <Badge variant="neutral">
                  {dashboard.intelligence.contingency.activePlans} Planuri B active
                </Badge>
                <Badge variant="neutral">
                  {dashboard.intelligence.automations.awaitingApproval} automatizări în aprobare
                </Badge>
              </div>
            ) : null}
            {dashboard.risks.top.length ? (
              <div className="grid gap-2 md:grid-cols-3">
                {dashboard.risks.top.map((risk) => (
                  <button
                    key={risk.id}
                    type="button"
                    onClick={() => router.push(`/risks/${risk.id}`)}
                    className="rounded-lg border border-line p-3 text-left hover:border-danger/40"
                  >
                    <p className="truncate text-sm font-medium text-ink">
                      {risk.title}
                    </p>
                    <p className="mt-1 text-xs text-faint">
                      Scor {risk.score}/25 · {risk.level}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">Nu există riscuri active.</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Achiziții și buget</CardTitle>
            <p className="mt-0.5 text-[13px] text-muted">
              Situația reală a angajamentelor, plăților externe și furnizorilor
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/budget")}
          >
            Deschide bugetul
            <ArrowRight className="size-3.5" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Buget angajat"
              value={money(dashboard.commercial.budget.committedMinor)}
              hint={`din ${money(dashboard.commercial.budget.targetTotalMinor)}`}
              icon={ListChecks}
              href="/budget"
            />
            <StatCard
              label="Plăți confirmate"
              value={money(dashboard.commercial.budget.paidMinor)}
              hint={`${dashboard.commercial.payments.scheduled} scadențe programate`}
              icon={CheckCircle2}
              href="/payments"
            />
            <StatCard
              label="Oferte primite"
              value={countStatuses(dashboard.commercial.procurement.offers)}
              hint={`${countStatuses(dashboard.commercial.procurement.rfqs)} cereri de ofertă`}
              icon={MailOpen}
              href="/offers"
            />
            <StatCard
              label="Contracte"
              value={countStatuses(dashboard.commercial.procurement.contracts)}
              hint={`${countStatuses(dashboard.commercial.procurement.bookings)} rezervări`}
              icon={CalendarDays}
              href="/contracts"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Documente și plăți online</CardTitle>
            <p className="mt-0.5 text-[13px] text-muted">
              Statusuri verificate din vault, semnături și providerul de plăți
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Documente în verificare"
              value={dashboard.documents.processing}
              hint={`${dashboard.documents.quarantined} în carantină`}
              icon={FileText}
              tone={dashboard.documents.quarantined ? "danger" : "default"}
              href="/documents"
            />
            <StatCard
              label="Semnături în curs"
              value={dashboard.documents.signatureEnvelopesInProgress}
              hint={`${dashboard.documents.signatureEnvelopesFailed} eșuate sau refuzate`}
              icon={FileText}
              tone={
                dashboard.documents.signatureEnvelopesFailed
                  ? "warning"
                  : "default"
              }
              href="/contracts"
            />
            <StatCard
              label="Checkout-uri deschise"
              value={dashboard.onlinePayments.openCheckouts}
              hint={`${dashboard.onlinePayments.failedPayments} plăți eșuate`}
              icon={CreditCard}
              tone={
                dashboard.onlinePayments.failedPayments ? "warning" : "default"
              }
              href="/payments"
            />
            <StatCard
              label="Capturat luna aceasta"
              value={money(dashboard.onlinePayments.capturedThisMonthMinor)}
              hint={`${dashboard.onlinePayments.disputedPayments} plăți contestate`}
              icon={CheckCircle2}
              tone={
                dashboard.onlinePayments.disputedPayments ? "danger" : "default"
              }
              href="/payments"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Invitați și RSVP</CardTitle>
            <p className="mt-0.5 text-[13px] text-muted">
              Date reale din CRM-ul invitaților, invitații și meniuri
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/guests")}
          >
            CRM invitați
            <ArrowRight className="size-3.5" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Invitați activi"
              value={dashboard.guestCrm.activeGuests}
              hint={
                dashboard.guestCrm.estimatedGuests === null
                  ? "Fără estimare în onboarding"
                  : `${dashboard.guestCrm.estimatedGuests} estimați în onboarding`
              }
              icon={Users}
              href="/guests"
            />
            <StatCard
              label="Invitații deschise"
              value={`${dashboard.guestCrm.opened}/${dashboard.guestCrm.invited}`}
              hint="Deschise din cele trimise"
              icon={MailOpen}
              href="/invitations"
            />
            <StatCard
              label="RSVP confirmate"
              value={dashboard.guestCrm.confirmed}
              hint={`${dashboard.guestCrm.declined} refuzuri · ${dashboard.guestCrm.noResponse} fără răspuns`}
              icon={CheckCircle2}
              href="/rsvp"
            />
            <StatCard
              label="Meniuri incomplete"
              value={dashboard.guestCrm.menuIncomplete}
              hint={`Alergii de verificat: ${dashboard.guestCrm.allergyIssues}`}
              icon={Utensils}
              tone={dashboard.guestCrm.allergyIssues ? "danger" : "default"}
              href="/menus"
            />
          </div>
          <p className="mt-3 text-xs text-faint">
            Logistică declarată: {dashboard.guestCrm.transportRequests}{" "}
            solicitări transport · {dashboard.guestCrm.accommodationRequests}{" "}
            solicitări cazare. Alocările sunt gestionate în modulele
            operaționale de mai jos.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Operațiuni invitați</CardTitle>
            <p className="mt-0.5 text-[13px] text-muted">
              Seating, capacitate transport și inventar cazare din date
              persistente
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            <StatCard
              label="Locuri la masă"
              value={`${dashboard.operations.seating.assignedGuests}/${dashboard.operations.seating.eligibleGuests}`}
              hint={`${dashboard.operations.seating.unassignedGuests} nealocați · ${dashboard.operations.seating.openIssues} probleme`}
              icon={Armchair}
              tone={
                dashboard.operations.seating.openIssues ? "warning" : "default"
              }
              href="/seating"
            />
            <StatCard
              label="Transport alocat"
              value={`${dashboard.operations.transport.assignedGuests}/${dashboard.operations.transport.requests}`}
              hint={`${dashboard.operations.transport.routes} rute · ${dashboard.operations.transport.seatsAvailable} locuri disponibile`}
              icon={Bus}
              tone={
                dashboard.operations.transport.openIssues
                  ? "warning"
                  : "default"
              }
              href="/transport"
            />
            <StatCard
              label="Cazare alocată"
              value={`${dashboard.operations.accommodation.assignedGuests}/${dashboard.operations.accommodation.requests}`}
              hint={`${dashboard.operations.accommodation.rooms} camere · ${dashboard.operations.accommodation.bedsAvailable} locuri disponibile`}
              icon={BedDouble}
              tone={
                dashboard.operations.accommodation.openIssues
                  ? "warning"
                  : "default"
              }
              href="/accommodation"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardHeader>
            <div>
              <CardTitle>Sarcini urgente</CardTitle>
              <p className="mt-0.5 text-[13px] text-muted">
                Prioritizate din planul real
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/plan")}
            >
              Vezi toate
              <ArrowRight className="size-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            {dashboard.urgentTasks.length ? (
              <ul className="space-y-2">
                {dashboard.urgentTasks.map((task) => (
                  <li key={task.id}>
                    <button
                      onClick={() => router.push("/plan")}
                      className="flex w-full min-w-0 flex-col items-start gap-2 rounded-lg border border-line p-3 text-left transition-colors hover:border-brand/40 sm:flex-row sm:items-center sm:gap-3"
                    >
                      <span className="w-full min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">
                          {task.title}
                        </span>
                        <span className="text-xs text-muted">
                          {task.assigneeName ?? "Nealocat"} · {task.category}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <Badge
                          variant={
                            task.priority === "urgent" ? "danger" : "warning"
                          }
                        >
                          {task.priority}
                        </Badge>
                        {task.dueAt && (
                          <span className="text-xs text-faint">
                            {formatDateShort(task.dueAt)}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-8 text-center text-sm text-muted">
                Nu există sarcini urgente.
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <div>
              <CardTitle>Următoarele date</CardTitle>
              <p className="mt-0.5 text-[13px] text-muted">Calendar unificat</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/calendar")}
            >
              Calendar
              <ArrowRight className="size-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            {dashboard.upcomingDates.length ? (
              <ul className="space-y-3">
                {dashboard.upcomingDates.map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => router.push(item.href)}
                      className="flex w-full items-start gap-3 text-left"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                        <CalendarDays className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">
                          {item.title}
                        </span>
                        <span className="text-xs text-faint">
                          {formatDateShort(item.startAt)} ·{" "}
                          {item.sourceType.replaceAll("_", " ")}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-8 text-center text-sm text-muted">
                Evenimentele și deadline-urile vor apărea aici.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {dashboard.phases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Fazele organizării</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/timeline")}
            >
              Timeline
              <ArrowRight className="size-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3">
              {dashboard.phases.map((phase) => (
                <div
                  key={phase.id}
                  className="rounded-lg border border-line p-3"
                >
                  <p className="text-sm font-semibold text-ink">
                    {phase.title}
                  </p>
                  <Badge
                    variant={
                      phase.status === "completed"
                        ? "success"
                        : phase.status === "in_progress"
                          ? "info"
                          : "neutral"
                    }
                    className="mt-2"
                  >
                    {phase.status.replaceAll("_", " ")}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Module încă indisponibile</CardTitle>
            <p className="mt-0.5 text-[13px] text-muted">
              Nu afișăm date simulate pentru modulele indisponibile.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Object.keys(dashboard.unavailableModules).map((module) => (
              <Badge key={module} variant="outline">
                {module} · planificat
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
