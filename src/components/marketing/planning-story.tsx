"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ClipboardCheck,
  LayoutList,
  Lightbulb,
  X,
} from "lucide-react";
import { planningChapter } from "@/content/marketing/sarbato";
import { cn } from "@/lib/utils";

type PanelView = "proposal" | "applied";

const panelId = "planificare-panou";

const panelViews: readonly {
  id: PanelView;
  label: string;
  Icon: typeof ClipboardCheck;
}[] = [
  { id: "proposal", label: "Propunere de plan", Icon: ClipboardCheck },
  { id: "applied", label: "Planul aplicat", Icon: LayoutList },
];

/* Elementele reproduc ierarhia reală a propunerii: fază, reper, sarcină.
   Un element obligatoriu poate fi exclus numai cu motiv scris. */
const proposalItems = [
  {
    kind: "Fază",
    title: "Pregătirea evenimentului",
    depth: 0,
    required: true,
    included: true,
  },
  {
    kind: "Reper",
    title: "Locația confirmată",
    depth: 1,
    required: true,
    included: true,
  },
  {
    kind: "Sarcină",
    title: "Cere oferte pentru locație",
    depth: 2,
    required: true,
    included: true,
    priority: "Ridicată",
  },
  {
    kind: "Sarcină",
    title: "Pregătește lista de invitați",
    depth: 2,
    required: false,
    included: true,
    priority: "Medie",
  },
  {
    kind: "Fază",
    title: "Ceremonie religioasă",
    depth: 0,
    required: true,
    included: false,
    reason: "Facem doar cununie civilă.",
  },
] as const;

const assumptions = [
  "Pregătirea începe cu locația și lista de invitați.",
  "Reperele urmează ordinea din răspunsurile de onboarding.",
] as const;

const warnings = [
  "Nu ai ales încă un furnizor pentru foto-video.",
  "Termenele apropiate cer rezervarea locației mai devreme.",
] as const;

const covered = ["Planificare", "Locație", "Invitații", "Furnizori"] as const;
const missing = "Foto-video";

const priorityTone = {
  Urgentă: "bg-danger-soft text-danger",
  Ridicată: "bg-warning-soft text-warning",
  Medie: "bg-info-soft text-info",
} as const;

const statusTone = {
  Neînceput: "bg-subtle text-muted",
  "În lucru": "bg-info-soft text-info",
  Blocat: "bg-danger-soft text-danger",
  Finalizat: "bg-success-soft text-success",
} as const;

/* Câmpurile sunt cele reale ale unei sarcini: responsabil (membru sau Nealocat),
   prioritate, stare, termen, motivul blocării și dependențele care țin
   finalizarea. Termenele rămân relative, ca să nu inventăm date. */
const planTasks = [
  {
    title: "Cere oferte pentru locație",
    category: "Locație",
    owner: "Proprietar",
    priority: "Urgentă",
    status: "În lucru",
    deadline: "Termen apropiat",
    overdue: false,
  },
  {
    title: "Trimite invitațiile",
    category: "Invitații",
    owner: "Nealocat",
    priority: "Ridicată",
    status: "Neînceput",
    deadline: "Fără termen",
    overdue: false,
    note: {
      label: "Finalizarea așteaptă",
      value: "Cere oferte pentru locație",
    },
  },
  {
    title: "Alege meniul",
    category: "Meniu și băuturi",
    owner: "Wedding planner",
    priority: "Medie",
    status: "Blocat",
    deadline: "Termen depășit",
    overdue: true,
    note: {
      label: "Motivul blocării",
      value: "Așteptăm oferta finală",
    },
  },
  {
    title: "Pregătește lista de invitați",
    category: "Lista de invitați",
    owner: "Proprietar",
    priority: "Medie",
    status: "Finalizat",
    deadline: "Finalizată",
    overdue: false,
  },
] as const;

/* Cifrele sunt derivate din rândurile afișate, ca să nu poată devia de la
   exemplul de produs. Filtrele și coloanele sunt cele reale din /plan. */
const focusFilters = [
  {
    label: "Depășite",
    count: planTasks.filter((task) => task.overdue).length,
  },
  {
    label: "Blocate",
    count: planTasks.filter((task) => task.status === "Blocat").length,
  },
  {
    label: "Nealocate",
    count: planTasks.filter((task) => task.owner === "Nealocat").length,
  },
];

const boardColumns = (
  ["Neînceput", "În lucru", "În așteptare", "Blocat", "Finalizat"] as const
).map((label) => ({
  label,
  count: planTasks.filter((task) => task.status === label).length,
}));

export function PlanningStory() {
  const [view, setView] = React.useState<PanelView>("proposal");

  return (
    <section
      id={planningChapter.id}
      className="relative scroll-mt-16 overflow-hidden bg-background py-14 text-ink sm:scroll-mt-[4.5rem] sm:py-24 lg:py-32"
      aria-labelledby={`${planningChapter.id}-title`}
    >
      <span aria-hidden className="mkt-thread-rail hidden bg-brand lg:block" />
      <span aria-hidden className="mkt-thread-node hidden bg-brand lg:block" />
      <div className="marketing-safe-container mx-auto grid w-full max-w-[90rem] gap-8 px-4 sm:gap-12 sm:px-8 lg:grid-cols-[minmax(20rem,0.72fr)_minmax(0,1.28fr)] lg:items-center lg:gap-16 lg:px-10 xl:px-12">
        <div className="max-w-[36rem]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <p className="text-sm font-semibold text-accent-strong">
              {planningChapter.navLabel}
            </p>
            <ol
              className="flex flex-wrap items-center gap-2"
              aria-label="Parcursul planului"
            >
              {planningChapter.arc.map((step, index) => (
                <li
                  key={step}
                  className="flex items-center gap-2 text-xs font-semibold text-muted"
                >
                  {index > 0 ? (
                    <ArrowRight className="size-3" aria-hidden />
                  ) : null}
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <h2
            id={`${planningChapter.id}-title`}
            className="marketing-heading mt-3 text-[clamp(2.25rem,10.5vw,2.75rem)] font-semibold leading-[1.04] tracking-[-0.03em] text-balance text-brand sm:mt-4 sm:text-[clamp(2.5rem,4vw,3.5rem)] sm:leading-[1.02] sm:tracking-[-0.035em]">
            {planningChapter.title}
          </h2>
          <p className="mt-4 max-w-[58ch] text-[1.0625rem] leading-7 text-muted sm:mt-6 sm:text-lg sm:leading-8">
            {planningChapter.lead}
          </p>

          <dl className="mt-6 border-t border-line-strong sm:mt-8">
            {planningChapter.facts.map((fact) => (
              <div
                key={fact.term}
                className="flex flex-col gap-1 border-b border-line py-3.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
              >
                <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-faint">
                  {fact.term}
                </dt>
                <dd className="text-sm font-semibold leading-5 text-ink sm:text-right">
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="min-w-0">
          <div
            role="group"
            aria-label="Planul evenimentului. De la propunere la planul de lucru."
            className="marketing-product-surface overflow-hidden"
          >
            <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-line px-4 py-3 sm:gap-3 sm:px-5">
              <div>
                <p className="text-sm font-semibold text-ink">
                  Planul evenimentului
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  De la propunere la planul de lucru
                </p>
              </div>
              <span
                data-testid="showcase-label"
                className="max-w-full rounded-full bg-subtle px-3 py-1.5 text-xs font-semibold leading-4 text-muted"
              >
                Exemplu de produs — nu reprezintă datele unui client.
              </span>
            </div>

            <div className="border-b border-line bg-subtle px-3 py-3 sm:px-5">
              <div
                role="group"
                aria-label="Alege ce arată planul"
                className="flex flex-wrap gap-1.5"
              >
                {panelViews.map((item) => {
                  const active = item.id === view;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setView(item.id)}
                      aria-pressed={active}
                      aria-controls={panelId}
                      className={cn(
                        "inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors",
                        active
                          ? "bg-brand text-on-brand"
                          : "bg-elevated text-muted hover:text-brand",
                      )}
                    >
                      <item.Icon className="size-4" aria-hidden />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Pe lățimile unde panoul stă lângă text, cele două stări sunt
                egalizate ca secțiunea să nu salte la comutare. Pragurile urmează
                lățimea reală a coloanei, care nu crește liniar cu ecranul.
                Banda de final absoarbe diferența, deci nu rămâne gol în card. */}
            <div
              id={panelId}
              key={view}
              className="mkt-phone-swap @container flex min-w-0 flex-col min-[1024px]:min-h-[41.25rem] min-[1060px]:min-h-[38.75rem] min-[1140px]:min-h-[35.25rem] min-[1240px]:min-h-[34.75rem] min-[1440px]:min-h-[33rem]"
            >
              {view === "proposal" ? <ProposalView /> : <AppliedView />}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProposalView() {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* La lățimi mari propunerea folosește lățimea panoului pe două coloane,
          ca să nu crească pe verticală mai mult decât coloana de text. */}
      <div className="grid min-w-0 flex-1 @min-[34rem]:grid-cols-[minmax(0,1.12fr)_minmax(15rem,0.88fr)]">
        <div className="flex min-w-0 flex-col border-b border-line @min-[34rem]:border-r @min-[34rem]:border-b-0">
          <div className="flex flex-col gap-2 border-b border-line px-3.5 py-2.5 @min-[26rem]:flex-row @min-[26rem]:items-center @min-[26rem]:justify-between sm:px-5">
            <p className="text-sm font-semibold text-ink">
              Propunere generată din onboarding
            </p>
            <span className="inline-flex w-fit items-center rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-muted">
              Determinist
            </span>
          </div>

          <ul className="divide-y divide-line">
            {proposalItems.map((item) => (
              <ProposalRow key={item.title} item={item} />
            ))}
          </ul>
        </div>

        <div className="flex min-w-0 flex-col divide-y divide-line">
          <div className="p-3.5 sm:p-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Lightbulb className="size-4 text-brand" aria-hidden />
              Ce am presupus
            </p>
            <ul className="mt-1.5 space-y-1">
              {assumptions.map((item) => (
                <li key={item} className="text-xs leading-5 text-muted">
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-warning-soft/40 p-3.5 sm:p-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-warning">
              <AlertTriangle className="size-4" aria-hidden />
              De verificat
            </p>
            <ul className="mt-1.5 space-y-1">
              {warnings.map((item) => (
                <li key={item} className="text-xs leading-5 text-muted">
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex-1 p-3.5 sm:p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-faint">
              Ce include propunerea
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {covered.map((item) => (
                <li
                  key={item}
                  className="rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success"
                >
                  {item}
                </li>
              ))}
              <li className="rounded-full bg-danger-soft px-2.5 py-1 text-xs font-semibold text-danger">
                Lipsește: {missing}
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-line bg-brand-softer px-3.5 py-3 @min-[30rem]:flex-row @min-[30rem]:items-center sm:px-5">
        <span className="inline-flex min-h-10 w-fit shrink-0 items-center rounded-lg bg-brand px-3.5 text-sm font-semibold text-on-brand">
          Aplică planul
        </span>
        <p className="text-xs leading-5 text-muted">
          Nimic nu devine plan definitiv până la aplicare. Poți regenera
          propunerea sau o poți respinge.
        </p>
      </div>
    </div>
  );
}

function ProposalRow({ item }: { item: (typeof proposalItems)[number] }) {
  return (
    <li
      className={cn(
        "flex flex-col gap-2 px-3.5 py-2.5 @min-[26rem]:flex-row @min-[26rem]:items-start @min-[26rem]:justify-between @min-[26rem]:gap-3 sm:px-5",
        !item.included && "bg-subtle",
      )}
    >
      <div
        className="min-w-0"
        style={{ paddingInlineStart: `${item.depth * 0.875}rem` }}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-line px-2 py-0.5 text-[0.6875rem] font-semibold text-muted">
            {item.kind}
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold",
              item.required
                ? "bg-warning-soft text-warning"
                : "bg-subtle text-muted",
            )}
          >
            {item.required ? "Obligatoriu" : "Opțional"}
          </span>
          {item.included ? null : (
            <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[0.6875rem] font-semibold text-danger">
              Exclus
            </span>
          )}
          {"priority" in item ? (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold",
                priorityTone[item.priority],
              )}
            >
              {item.priority}
            </span>
          ) : null}
        </div>
        <p
          className={cn(
            "mt-1.5 text-sm font-semibold leading-5",
            item.included ? "text-ink" : "text-muted line-through",
          )}
        >
          {item.title}
        </p>
        {"reason" in item ? (
          <p className="mt-1 text-xs leading-5 text-muted">
            <span className="font-semibold text-ink">Motivul excluderii:</span>{" "}
            {item.reason}
          </p>
        ) : null}
      </div>
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg px-2.5 py-1.5 text-xs font-semibold",
          item.included ? "text-muted" : "text-brand",
        )}
      >
        {item.included ? (
          <>
            <X className="size-3.5" aria-hidden />
            Exclude
          </>
        ) : (
          <>
            <Check className="size-3.5" aria-hidden />
            Include
          </>
        )}
      </span>
    </li>
  );
}

function AppliedView() {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-3.5 py-2.5 sm:px-5">
        <p className="text-sm font-semibold text-ink">Toate sarcinile</p>
        <ul className="flex flex-wrap gap-1.5">
          {focusFilters.map((filter) => (
            <li
              key={filter.label}
              className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-muted"
            >
              {filter.label}
              <span className="tabular-nums text-ink">{filter.count}</span>
            </li>
          ))}
        </ul>
      </div>

      <ul className="divide-y divide-line @min-[38rem]:hidden">
        {planTasks.map((task) => (
          <li key={task.title} className="px-3.5 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-sm font-semibold leading-5 text-ink">
                {task.title}
              </p>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold",
                  statusTone[task.status],
                )}
              >
                {task.status}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-subtle px-2 py-0.5 text-[0.6875rem] font-semibold text-muted">
                {task.category}
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold",
                  priorityTone[task.priority],
                )}
              >
                {task.priority}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span
                className={cn(
                  "font-semibold",
                  task.owner === "Nealocat" ? "text-warning" : "text-ink",
                )}
              >
                {task.owner}
              </span>
              <span className={task.overdue ? "text-danger" : "text-muted"}>
                {task.deadline}
              </span>
            </div>
            {"note" in task ? <TaskNote note={task.note} /> : null}
          </li>
        ))}
      </ul>

      <table className="hidden w-full table-fixed @min-[38rem]:table">
        <caption className="sr-only">
          Sarcinile din planul aplicat, cu responsabil, prioritate, stare și
          termen.
        </caption>
        <thead>
          <tr className="border-b border-line">
            <th
              scope="col"
              className="px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.06em] text-faint sm:px-5"
            >
              Sarcină
            </th>
            <th
              scope="col"
              className="w-[8.5rem] px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.06em] text-faint"
            >
              Responsabil
            </th>
            <th
              scope="col"
              className="hidden w-[6.5rem] px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.06em] text-faint @min-[46rem]:table-cell"
            >
              Prioritate
            </th>
            <th
              scope="col"
              className="w-[6.5rem] px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.06em] text-faint"
            >
              Stare
            </th>
            <th
              scope="col"
              className="w-[9rem] px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.06em] text-faint sm:px-5"
            >
              Termen
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {planTasks.map((task) => (
            <tr key={task.title}>
              <td className="px-3.5 py-3 align-top sm:px-5">
                <p className="text-sm font-semibold leading-5 text-ink">
                  {task.title}
                </p>
                <p className="mt-1 text-xs text-muted">{task.category}</p>
                {"note" in task ? <TaskNote note={task.note} /> : null}
              </td>
              <td className="px-2 py-3 align-top">
                <span
                  className={cn(
                    "text-xs font-semibold",
                    task.owner === "Nealocat" ? "text-warning" : "text-ink",
                  )}
                >
                  {task.owner}
                </span>
              </td>
              <td className="hidden px-2 py-3 align-top @min-[46rem]:table-cell">
                <span
                  className={cn(
                    "inline-block rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold",
                    priorityTone[task.priority],
                  )}
                >
                  {task.priority}
                </span>
              </td>
              <td className="px-2 py-3 align-top">
                <span
                  className={cn(
                    "inline-block rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold",
                    statusTone[task.status],
                  )}
                >
                  {task.status}
                </span>
              </td>
              <td className="px-3.5 py-3 align-top sm:px-5">
                <span
                  className={cn(
                    "text-xs",
                    task.overdue ? "font-semibold text-danger" : "text-muted",
                  )}
                >
                  {task.deadline}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-auto grid border-t border-line @min-[34rem]:grid-cols-[minmax(0,1.12fr)_minmax(15rem,0.88fr)]">
        <div className="border-b border-line px-3.5 py-3 @min-[34rem]:border-r @min-[34rem]:border-b-0 sm:px-5">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-faint">
            După stare
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-px bg-line @min-[24rem]:grid-cols-3 @min-[34rem]:grid-cols-5">
            {boardColumns.map((column) => (
              <li key={column.label} className="bg-elevated px-2.5 py-2">
                <span className="block text-[0.6875rem] font-semibold leading-4 text-muted">
                  {column.label}
                </span>
                <span className="mt-0.5 block text-sm font-semibold tabular-nums text-ink">
                  {column.count}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-subtle px-3.5 py-3 sm:px-5">
          <p className="text-xs leading-5 text-muted">
            <span className="font-semibold text-ink">
              Toate sarcinile și După stare
            </span>{" "}
            sunt vizualizările complete ale planului. Cronologie și Calendar au
            fiecare pagina lor, cu reperele și termenele din tot evenimentul.
          </p>
        </div>
      </div>
    </div>
  );
}

function TaskNote({ note }: { note: { label: string; value: string } }) {
  return (
    <p className="mt-1.5 text-xs leading-5 text-muted">
      <span className="font-semibold text-ink">{note.label}:</span> {note.value}
    </p>
  );
}
