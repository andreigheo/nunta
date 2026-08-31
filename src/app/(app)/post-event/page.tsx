"use client";

import * as React from "react";
import Link from "next/link";
import {
  Archive,
  Check,
  CircleDollarSign,
  Gift,
  HeartHandshake,
  MailCheck,
  PackageCheck,
  PartyPopper,
  Send,
  Plus,
  FileText,
  CreditCard,
  Star,
} from "lucide-react";
import type { TaskSummary } from "@weddingos/contracts";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/api/workspace-context";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  Progress,
  useToast,
} from "@/components/ui";

type CloseTask = {
  id: string;
  title: string;
  area: "Furnizori" | "Invitați" | "Amintiri" | "Administrativ";
  owner: string;
  due: string;
  done: boolean;
};

const seedTasks: CloseTask[] = [
  {
    id: "pw-1",
    title: "Achită soldul final către DJ",
    area: "Furnizori",
    owner: "Mihai",
    due: "13 sept.",
    done: true,
  },
  {
    id: "pw-2",
    title: "Returnează recuzita foto",
    area: "Furnizori",
    owner: "Elena",
    due: "14 sept.",
    done: false,
  },
  {
    id: "pw-3",
    title: "Trimite mulțumirile către invitați",
    area: "Invitați",
    owner: "Ana",
    due: "18 sept.",
    done: false,
  },
  {
    id: "pw-4",
    title: "Confirmă adresele pentru albume",
    area: "Amintiri",
    owner: "Ana",
    due: "20 sept.",
    done: false,
  },
  {
    id: "pw-5",
    title: "Selectează 80 de fotografii pentru album",
    area: "Amintiri",
    owner: "Ana & Mihai",
    due: "28 sept.",
    done: false,
  },
  {
    id: "pw-6",
    title: "Descarcă și arhivează toate contractele",
    area: "Administrativ",
    owner: "Mihai",
    due: "30 sept.",
    done: true,
  },
  {
    id: "pw-7",
    title: "Închide bugetul cu sumele finale",
    area: "Administrativ",
    owner: "Mihai",
    due: "3 oct.",
    done: false,
  },
];

const returns = [
  {
    label: "Recuzită foto",
    vendor: "Cabina Fericită",
    date: "14 sept.",
    status: "De returnat",
  },
  {
    label: "Vaze și suporturi",
    vendor: "Atelier Floral Iris",
    date: "15 sept.",
    status: "Programat",
  },
  {
    label: "Cheile locației",
    vendor: "Conacul Ambient",
    date: "13 sept.",
    status: "Returnat",
  },
];

export default function PostEventPage() {
  const { toast } = useToast();
  const { currentWorkspace, bootstrap, demoMode } = useWorkspace();
  const [tasks, setTasks] = React.useState(seedTasks);
  const [thanksSent, setThanksSent] = React.useState(118);
  const [closeOpen, setCloseOpen] = React.useState(false);
  const [closed, setClosed] = React.useState(false);

  if (!demoMode) {
    return currentWorkspace ? (
      <ConnectedPostEvent
        workspaceId={currentWorkspace.id}
        title={currentWorkspace.title}
        eventDate={currentWorkspace.eventDate}
        canWrite={
          bootstrap?.membership.capabilities.includes("task.write") ?? false
        }
      />
    ) : null;
  }

  const done = tasks.filter((task) => task.done).length;
  const completion = Math.round((done / tasks.length) * 100);
  const grouped = (
    [
      "Furnizori",
      "Invitați",
      "Amintiri",
      "Administrativ",
    ] as CloseTask["area"][]
  ).map((area) => ({
    area,
    tasks: tasks.filter((task) => task.area === area),
  }));

  function toggleTask(id: string) {
    setTasks((current) =>
      current.map((task) =>
        task.id === id ? { ...task, done: !task.done } : task,
      ),
    );
  }

  function sendThanks() {
    if (thanksSent >= 146) {
      toast({
        title: "Mulțumirile sunt deja trimise",
        description: "Toți destinatarii eligibili au primit mesajul.",
        variant: "info",
      });
      return;
    }
    setThanksSent(146);
    toast({
      title: "Mulțumiri trimise",
      description: "28 de mesaje restante au fost programate pentru trimitere.",
      variant: "success",
    });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title="După eveniment"
        description="Închideți lucrurile practice, păstrați amintirile și mulțumiți oamenilor care au fost alături de voi."
        actions={
          <Button
            variant={closed ? "secondary" : "outline"}
            size="sm"
            disabled={closed}
            onClick={() => setCloseOpen(true)}
          >
            <Archive className="size-3.5" aria-hidden />
            {closed ? "Eveniment închis" : "Închide evenimentul"}
          </Button>
        }
      />

      <Card className="overflow-hidden border-accent/40">
        <CardContent className="relative grid gap-6 p-6 lg:grid-cols-[1fr_18rem] lg:items-center">
          <div
            className="pointer-events-none absolute -right-12 -top-16 size-44 rounded-full border-[24px] border-accent-soft opacity-60"
            aria-hidden
          />
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-accent-strong">
              <PartyPopper className="size-4" aria-hidden />
              După ziua cea mare
            </span>
            <h2 className="mt-2 font-brand text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Ultimele detalii merită aceeași grijă.
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              Aveți {tasks.length - done} pași deschiși. După finalizare,
              spațiul rămâne disponibil în arhivă, doar pentru consultare.
            </p>
          </div>
          <div className="relative rounded-xl border border-line bg-surface/90 p-4 shadow-card">
            <div className="flex items-end justify-between">
              <span className="text-3xl font-semibold text-ink">
                {completion}%
              </span>
              <span className="text-xs text-faint">
                {done}/{tasks.length} rezolvate
              </span>
            </div>
            <Progress
              value={completion}
              className="mt-3"
              aria-label="Progres închidere eveniment"
            />
            <p className="mt-2 text-xs text-muted">
              {completion === 100
                ? "Totul este pregătit pentru arhivare."
                : "Continuă cu următorul pas din listă."}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[13px] font-medium text-muted">
                  Mulțumiri trimise
                </p>
                <p className="mt-1 text-2xl font-semibold text-ink">
                  {thanksSent}
                  <span className="text-base text-faint">/146</span>
                </p>
              </div>
              <span className="flex size-9 items-center justify-center rounded-lg bg-brand-soft text-brand">
                <MailCheck className="size-4.5" aria-hidden />
              </span>
            </div>
            <Button
              className="mt-4 w-full"
              size="sm"
              variant={thanksSent === 146 ? "secondary" : "outline"}
              onClick={sendThanks}
            >
              <Send className="size-3.5" aria-hidden />
              {thanksSent === 146 ? "Toate au fost trimise" : "Trimite restul"}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[13px] font-medium text-muted">
                  Obiecte de returnat
                </p>
                <p className="mt-1 text-2xl font-semibold text-ink">2</p>
                <p className="text-xs text-faint">următorul: 14 sept.</p>
              </div>
              <span className="flex size-9 items-center justify-center rounded-lg bg-warning-soft text-warning">
                <PackageCheck className="size-4.5" aria-hidden />
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[13px] font-medium text-muted">
                  Sold de recuperat
                </p>
                <p className="mt-1 text-2xl font-semibold text-ink">
                  1.500 lei
                </p>
                <p className="text-xs text-faint">garanție locație</p>
              </div>
              <span className="flex size-9 items-center justify-center rounded-lg bg-success-soft text-success">
                <CircleDollarSign className="size-4.5" aria-hidden />
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(18rem,0.8fr)]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Lista de închidere</CardTitle>
              <p className="mt-0.5 text-[13px] text-muted">
                Pași ordonați pe arii de responsabilitate
              </p>
            </div>
            <Badge variant={completion === 100 ? "success" : "brand"}>
              {completion}%
            </Badge>
          </CardHeader>
          <CardContent className="space-y-5 pt-1">
            {grouped.map((group) => (
              <section key={group.area} aria-labelledby={`group-${group.area}`}>
                <h3
                  id={`group-${group.area}`}
                  className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-faint"
                >
                  {group.area}
                </h3>
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {group.tasks.map((task) => (
                    <li
                      key={task.id}
                      className="flex items-center gap-3 px-3 py-3"
                    >
                      <Checkbox
                        checked={task.done}
                        onCheckedChange={() => toggleTask(task.id)}
                        aria-label={`${task.done ? "Redeschide" : "Finalizează"} ${task.title}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "text-sm font-medium",
                            task.done ? "text-faint line-through" : "text-ink",
                          )}
                        >
                          {task.title}
                        </p>
                        <p className="mt-0.5 text-xs text-faint">
                          {task.owner} · până la {task.due}
                        </p>
                      </div>
                      {task.done && (
                        <Check
                          className="size-4 shrink-0 text-success"
                          aria-label="Finalizat"
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Retururi & garanții</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="divide-y divide-line">
                {returns.map((item) => (
                  <li key={item.label} className="py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-ink">
                          {item.label}
                        </p>
                        <p className="text-xs text-faint">
                          {item.vendor} · {item.date}
                        </p>
                      </div>
                      <Badge
                        variant={
                          item.status === "Returnat"
                            ? "success"
                            : item.status === "Programat"
                              ? "info"
                              : "warning"
                        }
                      >
                        {item.status}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card className="bg-brand text-on-brand">
            <CardContent className="p-5">
              <HeartHandshake className="size-6 text-on-brand/80" aria-hidden />
              <h3 className="mt-3 font-brand text-xl font-semibold tracking-tight">
                Povestea continuă în arhivă
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-on-brand/75">
                Fotografiile, mesajele și documentele rămân împreună, într-un
                spațiu privat.
              </p>
              <Button
                className="mt-4 border-white/20 bg-white/10 text-white hover:bg-white/15"
                variant="outline"
                size="sm"
                onClick={() =>
                  toast({
                    title: "Arhiva va fi disponibilă după închidere",
                    variant: "info",
                  })
                }
              >
                <Gift className="size-3.5" aria-hidden />
                Pregătește capsula
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        onConfirm={() => {
          setClosed(true);
          setCloseOpen(false);
          toast({
            title: "Eveniment închis",
            description: "Spațiul a fost mutat în modul arhivă.",
            variant: "success",
          });
        }}
        title="Închizi evenimentul?"
        description={
          completion < 100
            ? `Mai sunt ${tasks.length - done} pași nefinalizați. Îi poți consulta și după arhivare.`
            : "Toți pașii sunt finalizați. Spațiul va deveni disponibil doar pentru consultare."
        }
        confirmLabel="Închide și arhivează"
      />
    </div>
  );
}

function ConnectedPostEvent({
  workspaceId,
  title,
  eventDate,
  canWrite,
}: {
  workspaceId: string;
  title: string;
  eventDate: string | null;
  canWrite: boolean;
}) {
  const { toast } = useToast();
  const [tasks, setTasks] = React.useState<TaskSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    title: "",
    description: "",
    dueAt: "",
  });

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setTasks(
        (await weddingOsApi.tasks(workspaceId, { category: "post_wedding" }))
          .items,
      );
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const createTask = async () => {
    if (!canWrite || !form.title.trim()) return;
    try {
      await weddingOsApi.createTask(workspaceId, {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        category: "post_wedding",
        priority: "medium",
        dueAt: form.dueAt
          ? new Date(`${form.dueAt}T12:00:00.000Z`).toISOString()
          : null,
        isPrivate: false,
        position: tasks.length,
      });
      setCreateOpen(false);
      setForm({ title: "", description: "", dueAt: "" });
      await load();
      toast({ title: "Pas adăugat", variant: "success" });
    } catch (caught) {
      toast({
        title: "Pasul nu a fost creat",
        description: apiErrorMessage(caught),
        variant: "error",
      });
    }
  };

  const toggle = async (task: TaskSummary) => {
    if (!canWrite) return;
    setBusyId(task.id);
    try {
      await weddingOsApi.transitionTask(workspaceId, task.id, {
        transition: task.status === "completed" ? "REOPEN" : "COMPLETE",
        version: task.version,
        confirmIncompleteSubtasks: true,
      });
      await load();
    } catch (caught) {
      toast({
        title: "Starea nu a fost actualizată",
        description: apiErrorMessage(caught),
        variant: "error",
      });
    } finally {
      setBusyId(null);
    }
  };

  if (loading)
    return <div className="h-72 animate-pulse rounded-xl bg-subtle" />;
  if (error)
    return (
      <ErrorState
        title="Pașii post-eveniment nu pot fi încărcați"
        description={error}
        onRetry={() => void load()}
      />
    );

  const completed = tasks.filter((task) => task.status === "completed").length;
  const completion = tasks.length
    ? Math.round((completed / tasks.length) * 100)
    : 0;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title="După eveniment"
        description={`Închide pașii reali pentru ${title}; sarcinile rămân în plan și în istoricul activității.`}
        meta={
          eventDate ? (
            <Badge variant="neutral">
              Eveniment{" "}
              {new Intl.DateTimeFormat("ro-RO", {
                dateStyle: "medium",
                timeZone: "UTC",
              }).format(new Date(`${eventDate}T00:00:00.000Z`))}
            </Badge>
          ) : null
        }
        actions={canWrite ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" aria-hidden />
            Adaugă un pas
          </Button>
        ) : (
          <Badge variant="neutral">doar citire</Badge>
        )}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Checklist persistent</CardTitle>
              <p className="mt-1 text-sm text-muted">
                {completed} din {tasks.length} pași finalizați
              </p>
            </div>
            <Badge
              variant={
                completion === 100 && tasks.length ? "success" : "neutral"
              }
            >
              {completion}%
            </Badge>
          </CardHeader>
          <CardContent>
            <Progress
              value={completion}
              max={100}
              tone={completion === 100 ? "success" : "brand"}
              aria-label="Progres post-eveniment"
            />
            {tasks.length ? (
              <div className="mt-5 divide-y divide-line">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "font-medium text-ink",
                          task.status === "completed" &&
                            "text-muted line-through",
                        )}
                      >
                        {task.title}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {task.dueAt
                          ? `Termen ${new Intl.DateTimeFormat("ro-RO", { dateStyle: "medium" }).format(new Date(task.dueAt))}`
                          : "Fără termen"}
                      </p>
                    </div>
                    {canWrite ? <Button
                      size="sm"
                      variant={
                        task.status === "completed" ? "ghost" : "outline"
                      }
                      disabled={busyId === task.id}
                      onClick={() => void toggle(task)}
                    >
                      {task.status === "completed"
                        ? "Redeschide"
                        : "Finalizează"}
                    </Button> : null}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={PartyPopper}
                title="Niciun pas post-eveniment"
                description="Adaugă numai pașii care se aplică evenimentului vostru."
                action={
                  canWrite
                    ? {
                        label: "Adaugă primul pas",
                        onClick: () => setCreateOpen(true),
                      }
                    : undefined
                }
              />
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <ConnectedModuleLink
            href="/payments"
            icon={CreditCard}
            title="Plăți și solduri"
            description="Verifică înregistrările și termenele reale."
          />
          <ConnectedModuleLink
            href="/documents"
            icon={FileText}
            title="Documente"
            description="Descarcă fișierele scanate și disponibile."
          />
          <ConnectedModuleLink
            href="/reviews"
            icon={Star}
            title="Recenzii furnizori"
            description="Publică numai evaluări eligibile și verificate."
          />
        </div>
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Pas post-eveniment"
        description="Sarcina va fi creată în planul real al workspace-ului."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Renunță
            </Button>
            <Button
              disabled={!form.title.trim()}
              onClick={() => void createTask()}
            >
              Creează pasul
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Titlu" htmlFor="post-event-title">
            <Input
              id="post-event-title"
              maxLength={240}
              value={form.title}
              onChange={(event) =>
                setForm({ ...form, title: event.target.value })
              }
            />
          </Field>
          <Field label="Descriere" htmlFor="post-event-description">
            <Input
              id="post-event-description"
              maxLength={4000}
              value={form.description}
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
            />
          </Field>
          <Field label="Termen" htmlFor="post-event-date">
            <Input
              id="post-event-date"
              type="date"
              value={form.dueAt}
              onChange={(event) =>
                setForm({ ...form, dueAt: event.target.value })
              }
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function ConnectedModuleLink({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: typeof CreditCard;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      <Card interactive>
        <CardContent className="flex items-start gap-3 p-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <Icon className="size-5" aria-hidden />
          </span>
          <div>
            <p className="font-semibold text-ink">{title}</p>
            <p className="mt-1 text-sm text-muted">{description}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
