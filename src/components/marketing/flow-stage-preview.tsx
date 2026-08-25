import * as React from "react";
import {
  AlertTriangle,
  Armchair,
  BedDouble,
  CalendarCheck2,
  CalendarDays,
  FileCheck2,
  ListChecks,
  MailCheck,
  MapPin,
  Palette,
  ScanLine,
  ShieldCheck,
  UsersRound,
  UtensilsCrossed,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { flow } from "@/content/marketing/sarbato";
import { cn } from "@/lib/utils";

type StageId = (typeof flow.steps)[number]["id"];
type ChapterId = (typeof flow.chapters)[number]["id"];
type StageOutcome = { readonly module: string; readonly state: string };

const outcomesByStage = flow.steps.reduce(
  (map, step) => {
    map[step.id] = step.outcomes;
    return map;
  },
  {} as Record<StageId, readonly StageOutcome[]>,
);

const chapterIdByStage = Object.fromEntries(
  flow.chapters.flatMap((chapter) =>
    chapter.stepIds.map((stepId) => [stepId, chapter.id]),
  ),
) as Record<StageId, ChapterId>;

const stateChip: Record<ChapterId, string> = {
  planning: "bg-brand-soft text-brand",
  guests: "bg-accent-soft text-accent-strong",
  vendors: "bg-warning-soft text-warning",
  "event-day": "bg-success-soft text-success",
};

const moduleIcons: Record<string, LucideIcon> = {
  Calendar: CalendarDays,
  Echipă: UsersRound,
  "Plan B": ShieldCheck,
  Program: CalendarCheck2,
  Detalii: MapPin,
  RSVP: MailCheck,
  Invitat: UsersRound,
  Meniu: UtensilsCrossed,
  Mese: Armchair,
  Transport: MapPin,
  Meniuri: UtensilsCrossed,
  "Transport și cazare": BedDouble,
  Rezervare: CalendarCheck2,
  Contract: FileCheck2,
  Buget: WalletCards,
  Categorie: WalletCards,
  Document: FileCheck2,
  Plată: WalletCards,
  Acum: CalendarCheck2,
  Urmează: ListChecks,
  Incident: AlertTriangle,
};

function StageSurface({
  title,
  state,
  chip,
  footer,
  emphasisFooter = false,
  children,
}: {
  title: string;
  state: string;
  chip: string;
  footer: string;
  emphasisFooter?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-line px-3 py-2.5 sm:px-4">
        <p className="min-w-0 text-sm font-semibold leading-5 text-ink">
          {title}
        </p>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold leading-4",
            chip,
          )}
        >
          {state}
        </span>
      </div>
      <div className="min-w-0 flex-1 p-3 sm:p-4">{children}</div>
      <p
        className={cn(
          "border-t px-3 py-2.5 text-xs leading-5 sm:px-4",
          emphasisFooter
            ? "border-brand bg-brand font-semibold text-on-brand"
            : "border-line text-muted",
        )}
      >
        {footer}
      </p>
    </div>
  );
}

function ModuleRows({
  outcomes,
  chip,
  label,
}: {
  outcomes: readonly StageOutcome[];
  chip: string;
  label: string;
}) {
  return (
    <ul className="divide-y divide-line" aria-label={label}>
      {outcomes.map((outcome) => {
        const Icon = moduleIcons[outcome.module] ?? CalendarDays;

        return (
          <li
            key={outcome.module}
            className="flex min-h-11 items-center gap-2.5 py-2 first:pt-0 last:pb-0"
          >
            <Icon
              className="size-4 shrink-0 text-brand"
              strokeWidth={1.9}
              aria-hidden
            />
            <span className="min-w-0 flex-1 text-sm font-semibold leading-5 text-ink">
              {outcome.module}
            </span>
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold leading-4",
                chip,
              )}
            >
              {outcome.state}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function StagePills({
  items,
  label,
  activeIndex = 0,
  numbered = false,
}: {
  items: readonly string[];
  label: string;
  activeIndex?: number;
  numbered?: boolean;
}) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={label}>
      {items.map((item, index) => (
        <li
          key={item}
          className={cn(
            "flex min-h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold leading-4",
            index === activeIndex
              ? "bg-brand text-on-brand"
              : "bg-subtle text-muted",
          )}
        >
          {numbered ? (
            <span
              className={cn(
                "tabular-nums",
                index === activeIndex ? "text-on-brand/70" : "text-faint",
              )}
              aria-hidden
            >
              {String(index + 1).padStart(2, "0")}
            </span>
          ) : null}
          {item}
        </li>
      ))}
    </ul>
  );
}

function StageTable({
  caption,
  columns,
  rows,
  chip,
}: {
  caption: string;
  columns: readonly string[];
  rows: readonly (readonly string[])[];
  chip: string;
}) {
  return (
    <table className="w-full border-collapse text-left">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column}
              scope="col"
              className="border-b border-line pr-2 pb-2 text-xs font-semibold leading-4 text-muted last:pr-0"
            >
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row[0]} className="border-b border-line last:border-b-0">
            {row.map((cell, index) => {
              const isLast = index === row.length - 1;

              if (index === 0) {
                return (
                  <th
                    key={`${row[0]}-${index}`}
                    scope="row"
                    className="py-2.5 pr-2 align-middle text-sm font-semibold leading-5 text-ink"
                  >
                    {cell}
                  </th>
                );
              }

              return (
                <td
                  key={`${row[0]}-${index}`}
                  className="py-2.5 pr-2 align-middle text-xs leading-4 text-muted last:pr-0"
                >
                  {isLast ? (
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold leading-4",
                        chip,
                      )}
                    >
                      {cell}
                    </span>
                  ) : (
                    cell
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PlanPreview({ chip }: { chip: string }) {
  return (
    <StageSurface
      title="Planul evenimentului"
      state="Actualizat"
      chip={chip}
      footer="Schimbările importante se revizuiesc înainte să intre în plan."
    >
      <StagePills
        label="Vizualizări disponibile pentru plan"
        items={["Listă", "Panou", "Cronologie", "Calendar"]}
      />
      <div className="mt-3 border-t border-line pt-2">
        <ModuleRows
          outcomes={outcomesByStage.plan}
          chip={chip}
          label="Ce se actualizează în plan"
        />
      </div>
    </StageSurface>
  );
}

function InvitationPreview({ chip }: { chip: string }) {
  return (
    <StageSurface
      title="Invitație"
      state="Publicată"
      chip={chip}
      footer="Invitații văd doar ce ai ales să arăți."
    >
      <StagePills
        label="Blocuri așezate în invitație"
        items={["Imagine hero", "Text și poveste", "Program", "RSVP"]}
      />
      <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span className="flex items-center gap-1.5 text-xs font-semibold leading-4 text-muted">
          <Palette className="size-3.5 shrink-0 text-brand" aria-hidden />
          Paletă
        </span>
        <span
          className="flex gap-1.5"
          role="img"
          aria-label="Paleta invitației, patru culori alese de tine"
        >
          {["bg-brand", "bg-accent", "bg-sun", "bg-success"].map((tone) => (
            <span
              key={tone}
              className={cn(
                "size-5 rounded-full border-2 border-surface shadow-card",
                tone,
              )}
              aria-hidden
            />
          ))}
        </span>
      </div>
      <div className="mt-3 border-t border-line pt-2">
        <ModuleRows
          outcomes={outcomesByStage.invitation}
          chip={chip}
          label="Ce ajunge public după publicare"
        />
      </div>
    </StageSurface>
  );
}

function RsvpPreview({ chip }: { chip: string }) {
  return (
    <StageSurface
      title="RSVP"
      state="Răspuns primit"
      chip={chip}
      footer="Alocarea la masă, pe rută sau în cameră o faci tu."
    >
      <ul
        className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2"
        aria-label="Unde ajunge un răspuns RSVP"
      >
        {outcomesByStage.rsvp.map((outcome) => {
          const Icon = moduleIcons[outcome.module] ?? CalendarDays;

          return (
            <li
              key={outcome.module}
              className="flex min-w-0 items-start gap-2.5 bg-subtle p-2.5"
            >
              <Icon
                className="mt-0.5 size-4 shrink-0 text-brand"
                strokeWidth={1.9}
                aria-hidden
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-5 text-ink">
                  {outcome.module}
                </span>
                <span
                  className={cn(
                    "mt-1.5 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold leading-4",
                    chip,
                  )}
                >
                  {outcome.state}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </StageSurface>
  );
}

const logisticsIntake: Record<string, string> = {
  Meniuri: "Preferințe din RSVP",
  Mese: "Cereri de alocare",
  "Transport și cazare": "Cereri de transport",
};

function LogisticsPreview({ chip }: { chip: string }) {
  return (
    <StageSurface
      title="Logistică"
      state="Din răspunsurile primite"
      chip={chip}
      footer="Excepțiile se văd înainte să confirmi furnizorii."
    >
      <StageTable
        caption="Ce a venit din RSVP în fiecare modul de logistică și ce urmează"
        columns={["Modul", "Ce a venit", "Ce urmează"]}
        rows={outcomesByStage.logistics.map((outcome) => [
          outcome.module,
          logisticsIntake[outcome.module] ?? "Din RSVP",
          outcome.state,
        ])}
        chip={chip}
      />
    </StageSurface>
  );
}

function VendorsPreview({ chip }: { chip: string }) {
  return (
    <StageSurface
      title="Furnizor"
      state="Ofertă acceptată"
      chip={chip}
      footer="Compararea ofertelor rămâne lângă decizie."
    >
      <StagePills
        label="Traseul comercial al unui furnizor"
        items={[
          "Cerere",
          "Ofertă",
          "Comparare",
          "Rezervare",
          "Contract",
          "Buget",
        ]}
        activeIndex={3}
        numbered
      />
      <div className="mt-3 border-t border-line pt-2">
        <ModuleRows
          outcomes={outcomesByStage.vendors}
          chip={chip}
          label="Ce rămâne împreună după acceptare"
        />
      </div>
    </StageSurface>
  );
}

function BudgetPreview({ chip }: { chip: string }) {
  return (
    <StageSurface
      title="Buget"
      state="Angajament înregistrat"
      chip={chip}
      emphasisFooter
      footer="Plata către furnizor o faci direct. Sarbato ține evidența, nu încasează și nu transferă bani."
    >
      <StageTable
        caption="Ce intră în buget după o rezervare confirmată"
        columns={["Ce intră în buget", "Stare"]}
        rows={outcomesByStage.budget.map((outcome) => [
          outcome.module,
          outcome.state,
        ])}
        chip={chip}
      />
    </StageSurface>
  );
}

function EventDayPreview({ chip }: { chip: string }) {
  const [now, next, incident] = outcomesByStage["event-day"];

  return (
    <StageSurface
      title="Ziua evenimentului"
      state="Desfășurător activ"
      chip={chip}
      footer="Echipa vede același plan, fără să-l refacă din mesaje."
    >
      <ul
        className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2"
        aria-label="Momentul curent și cel următor din desfășurător"
      >
        {[
          { outcome: now, line: "Momentul în desfășurare" },
          { outcome: next, line: "Ce se pregătește" },
        ].map(({ outcome, line }) => (
          <li key={outcome.module} className="min-w-0 bg-subtle p-2.5">
            <p className="text-[0.6875rem] font-semibold tracking-[0.08em] text-faint uppercase">
              {outcome.module}
            </p>
            <p className="mt-1 text-sm font-semibold leading-5 text-ink">
              {line}
            </p>
            <span
              className={cn(
                "mt-1.5 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold leading-4",
                chip,
              )}
            >
              {outcome.state}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 bg-subtle px-2.5 py-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold leading-4 text-muted">
          <ScanLine className="size-3.5 shrink-0 text-success" aria-hidden />
          Check-in: sosiri în curs
        </span>
        <span className="flex items-center gap-1.5 text-xs font-semibold leading-4 text-muted">
          <ListChecks className="size-3.5 shrink-0 text-warning" aria-hidden />
          Checklist: elemente deschise
        </span>
      </div>
      <div className="mt-2 flex min-h-11 flex-wrap items-center gap-x-2.5 gap-y-1.5 border border-line px-2.5 py-2">
        <AlertTriangle
          className="size-4 shrink-0 text-warning"
          strokeWidth={1.9}
          aria-hidden
        />
        <span className="text-sm font-semibold leading-5 text-ink">
          {incident.module}
        </span>
        <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold leading-4 text-brand">
          Plan B
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-semibold leading-4",
            chip,
          )}
        >
          {incident.state}
        </span>
      </div>
    </StageSurface>
  );
}

export function FlowStagePreview({ stageId }: { stageId: StageId }) {
  const chip = stateChip[chapterIdByStage[stageId]];

  switch (stageId) {
    case "plan":
      return <PlanPreview chip={chip} />;
    case "invitation":
      return <InvitationPreview chip={chip} />;
    case "rsvp":
      return <RsvpPreview chip={chip} />;
    case "logistics":
      return <LogisticsPreview chip={chip} />;
    case "vendors":
      return <VendorsPreview chip={chip} />;
    case "budget":
      return <BudgetPreview chip={chip} />;
    case "event-day":
      return <EventDayPreview chip={chip} />;
  }
}
