"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Download,
  FileText,
  Image,
  ListChecks,
  Search,
  Users,
  Wallet,
} from "lucide-react";
import type { ActivityItem } from "@/lib/types";
import { activity as demoActivity } from "@/lib/data/operations";
import { cn, formatDateLong, formatTime } from "@/lib/utils";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  PageHeader,
  Select,
  useToast,
} from "@/components/ui";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";

const moduleMeta: Record<string, { icon: React.ElementType; tone: string }> = {
  "Design Studio": { icon: Image, tone: "bg-accent-soft text-accent-strong" },
  Oferte: { icon: FileText, tone: "bg-info-soft text-info" },
  Plan: { icon: ListChecks, tone: "bg-brand-soft text-brand-strong dark:text-brand" },
  Furnizori: { icon: Users, tone: "bg-warning-soft text-warning" },
  Buget: { icon: Wallet, tone: "bg-success-soft text-success" },
  "Invitați": { icon: Users, tone: "bg-danger-soft text-danger" },
};

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

function dayLabel(iso: string) {
  const date = new Date(`${dayKey(iso)}T12:00:00`);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Astăzi";
  if (date.toDateString() === yesterday.toDateString()) return "Ieri";
  return formatDateLong(date);
}

export default function ActivityPage() {
  const { toast } = useToast();
  const { currentWorkspace, demoMode } = useWorkspace();
  const [activity, setActivity] = React.useState<ActivityItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [exporting, setExporting] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [person, setPerson] = React.useState("all");
  const [module, setModule] = React.useState("all");

  React.useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (demoMode) {
        setActivity(demoActivity);
        setLoading(false);
        return;
      }
      if (!currentWorkspace) return;
      setLoading(true);
      void weddingOsApi
        .activity(currentWorkspace.id)
        .then((result) => {
          if (cancelled) return;
          setActivity(
            result.items.map((item) => ({
              id: item.id,
              user: item.actorName ?? "Sarbato",
              module: activityModule(item.category),
              action: item.summary,
              time: item.occurredAt,
              href: "/overview",
            })),
          );
        })
        .catch((error) => {
          if (!cancelled)
            toast({ title: "Activitatea nu a putut fi încărcată", description: apiErrorMessage(error), variant: "error" });
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [currentWorkspace, demoMode, toast]);

  const people = React.useMemo(() => Array.from(new Set(activity.map((item) => item.user))).sort(), [activity]);
  const modules = React.useMemo(() => Array.from(new Set(activity.map((item) => item.module))).sort(), [activity]);

  const filtered = activity.filter((item) => {
    if (person !== "all" && item.user !== person) return false;
    if (module !== "all" && item.module !== module) return false;
    const needle = query.trim().toLocaleLowerCase("ro");
    return !needle || `${item.user} ${item.action} ${item.module}`.toLocaleLowerCase("ro").includes(needle);
  });

  const groups = filtered.reduce<Array<{ date: string; items: ActivityItem[] }>>((result, item) => {
    const key = dayKey(item.time);
    const existing = result.find((group) => group.date === key);
    if (existing) existing.items.push(item);
    else result.push({ date: key, items: [item] });
    return result;
  }, []);

  const resetFilters = () => {
    setQuery("");
    setPerson("all");
    setModule("all");
  };

  const exportActivity = async () => {
    if (!currentWorkspace || demoMode) return;
    setExporting(true);
    try {
      let job = await weddingOsApi.exportActivity(currentWorkspace.id, {
        ...(module === "all" ? {} : { category: module.toLowerCase() }),
      });
      for (let attempt = 0; attempt < 60 && !["completed", "failed", "dead_letter"].includes(job.status); attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 750));
        job = await weddingOsApi.job(job.id);
      }
      const artifact = job.result?.artifact as { downloadUrl?: string } | undefined;
      if (job.status !== "completed" || !artifact?.downloadUrl) throw new Error(job.error?.message ?? "Exportul nu a fost finalizat.");
      window.location.assign(artifact.downloadUrl);
    } catch (error) {
      toast({ title: "Exportul nu a putut fi creat", description: apiErrorMessage(error), variant: "error" });
    } finally {
      setExporting(false);
    }
  };

  const hasFilters = Boolean(query) || person !== "all" || module !== "all";

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Activitate"
        description="Istoricul modificărilor importante făcute de echipă în acest spațiu de lucru."
        actions={
          <Button variant="outline" size="sm" onClick={exportActivity} disabled={filtered.length === 0 || demoMode || exporting} title={demoMode ? "Disponibil într-un cont real" : undefined}>
            <Download className="size-3.5" aria-hidden />
            {exporting ? "Se pregătește…" : "Exportă CSV"}
          </Button>
        }
      />

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <Input
              icon={<Search className="size-4" />}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Caută în activitate…"
              aria-label="Caută în activitate"
              className="lg:min-w-72"
            />
            <div className="grid flex-1 grid-cols-2 gap-3">
              <Select aria-label="Filtrează după persoană" value={person} onChange={(event) => setPerson(event.target.value)}>
                <option value="all">Toată echipa</option>
                {people.map((name) => <option key={name} value={name}>{name}</option>)}
              </Select>
              <Select aria-label="Filtrează după modul" value={module} onChange={(event) => setModule(event.target.value)}>
                <option value="all">Toate modulele</option>
                {modules.map((name) => <option key={name} value={name}>{name}</option>)}
              </Select>
            </div>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="self-start lg:self-auto">
                Resetează
              </Button>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs text-muted">
            <CheckCircle2 className="size-4 text-success" aria-hidden />
            <span>{filtered.length} {filtered.length === 1 ? "modificare afișată" : "modificări afișate"}</span>
            <span aria-hidden>·</span>
            <span>Istoricul este păstrat timp de 12 luni</span>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card><CardContent className="py-14 text-center text-sm text-muted">Se încarcă activitatea…</CardContent></Card>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Nicio activitate găsită"
          description="Nu există modificări care să corespundă filtrelor selectate."
          action={{ label: "Resetează filtrele", onClick: resetFilters }}
        />
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.date} aria-labelledby={`activity-${group.date}`}>
              <div className="mb-2 flex items-center gap-2">
                <CalendarDays className="size-4 text-faint" aria-hidden />
                <h2 id={`activity-${group.date}`} className="text-sm font-semibold capitalize text-ink">
                  {dayLabel(group.items[0].time)}
                </h2>
                <Badge variant="neutral">{group.items.length}</Badge>
              </div>
              <Card>
                <CardContent className="p-0">
                  <ol className="divide-y divide-line">
                    {group.items.map((item) => (
                      <ActivityRow key={item.id} item={item} />
                    ))}
                  </ol>
                </CardContent>
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function activityModule(category: string): string {
  const labels: Record<string, string> = {
    workspace: "Sistem",
    onboarding: "Sistem",
    team: "Echipă",
    tasks: "Plan",
    guests: "Invitați",
    vendors: "Furnizori",
    finance: "Buget",
  };
  return labels[category] ?? category;
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const meta = moduleMeta[item.module] ?? { icon: FileText, tone: "bg-subtle text-muted" };
  const Icon = meta.icon;

  return (
    <li>
      <Link
        href={item.href}
        className="group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-subtle/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand sm:gap-4 sm:px-5"
      >
        <Avatar name={item.user} size="md" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-relaxed text-ink">
            <span className="font-semibold">{item.user}</span> {item.action}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-faint">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-medium", meta.tone)}>
              <Icon className="size-3" aria-hidden />
              {item.module}
            </span>
            <time dateTime={item.time}>{formatTime(item.time)}</time>
          </div>
        </div>
        <ArrowUpRight className="mt-1 size-4 shrink-0 text-faint transition-colors group-hover:text-brand" aria-hidden />
      </Link>
    </li>
  );
}
