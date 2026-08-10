"use client";

import * as React from "react";
import {
  Armchair,
  ArrowRight,
  CalendarCheck2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileCheck2,
  MailCheck,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { flow } from "@/content/marketing/sarbato";
import { cn } from "@/lib/utils";

type FlowId = (typeof flow.steps)[number]["id"];

const icons = {
  plan: ClipboardCheck,
  invitation: MailCheck,
  rsvp: UsersRound,
  logistics: Armchair,
  vendors: FileCheck2,
  budget: WalletCards,
  "event-day": CalendarCheck2,
} satisfies Record<FlowId, typeof ClipboardCheck>;

const stageTones = [
  "bg-brand-softer text-brand",
  "bg-accent-soft text-accent-strong",
  "bg-accent-soft text-accent-strong",
  "bg-sun-soft text-sun-strong",
  "bg-sun-soft text-sun-strong",
  "bg-success-soft text-success",
  "bg-success-soft text-success",
] as const;

export function LiveFlow() {
  const [activeId, setActiveId] = React.useState<FlowId>(flow.steps[0].id);
  const activeIndex = flow.steps.findIndex((step) => step.id === activeId);
  const active = flow.steps[activeIndex] ?? flow.steps[0];
  const previousIndex = Math.max(0, activeIndex - 1);
  const nextIndex = Math.min(flow.steps.length - 1, activeIndex + 1);
  const ActiveIcon = icons[active.id];

  return (
    <section
      id="flux"
      className="scroll-mt-24 border-y border-line bg-elevated py-11 sm:scroll-mt-[5.5rem] sm:py-16 lg:py-20"
      aria-labelledby="flow-title"
    >
      <div className="marketing-safe-container mx-auto w-full max-w-[90rem] px-4 sm:px-8 lg:px-10 xl:px-12">
        <div className="grid gap-5 lg:grid-cols-[minmax(18rem,0.72fr)_minmax(31rem,1.28fr)] lg:items-end lg:gap-12">
          <div>
            <p className="text-sm font-semibold text-accent-strong">
              Cum funcționează Sarbato
            </p>
            <h2
              id="flow-title"
              className="marketing-heading mt-2.5 max-w-[18ch] text-[clamp(2.125rem,9.5vw,2.5rem)] font-semibold leading-[1.04] tracking-[-0.03em] text-ink text-balance sm:mt-3 sm:text-[clamp(2.5rem,4vw,3.5rem)] sm:leading-[1.02] sm:tracking-[-0.035em]"
            >
              {flow.title}
            </h2>
          </div>
          <p className="max-w-[62ch] text-[1.0625rem] leading-7 text-muted sm:text-lg sm:leading-8">
            {flow.lead}
          </p>
        </div>

        <div className="mt-6 border border-line bg-surface sm:mt-10">
          <div className="border-b border-line px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-ink">
                Firul complet al evenimentului
              </p>
              <p className="text-xs leading-5 text-muted">
                Alege o etapă pentru a vedea ce preia și ce predă mai departe.
              </p>
            </div>
          </div>

          <div className="border-b border-line bg-subtle p-3 sm:p-4 lg:hidden">
            <label
              htmlFor="marketing-flow-stage"
              className="text-xs font-semibold text-faint"
            >
              Alege direct etapa
            </label>

            <div className="mt-2 flex min-w-0 items-center gap-2.5">
              <span
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-xl",
                  stageTones[activeIndex],
                )}
              >
                <ActiveIcon className="size-5" strokeWidth={1.9} aria-hidden />
              </span>
              <div className="relative min-w-0 flex-1">
                <select
                  id="marketing-flow-stage"
                  data-testid="flow-stage-select"
                  value={active.id}
                  onChange={(event) => setActiveId(event.target.value as FlowId)}
                  className="min-h-12 w-full appearance-none rounded-lg border border-line-strong bg-surface py-2.5 pl-3 pr-10 text-base font-semibold leading-6 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  {flow.steps.map((step, index) => (
                    <option key={step.id} value={step.id}>
                      {index + 1}. {step.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-brand"
                  aria-hidden
                />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveId(flow.steps[previousIndex].id)}
                disabled={activeIndex === 0}
                aria-label="Etapa anterioară"
                className="flex min-h-11 touch-manipulation items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-semibold text-brand transition-colors enabled:active:bg-sunken disabled:cursor-not-allowed disabled:opacity-35"
              >
                <ChevronLeft className="size-4" aria-hidden />
                Înapoi
              </button>

              <p className="px-1 text-xs font-semibold text-faint tabular-nums">
                {activeIndex + 1} / {flow.steps.length}
              </p>

              <button
                type="button"
                onClick={() => setActiveId(flow.steps[nextIndex].id)}
                disabled={activeIndex === flow.steps.length - 1}
                aria-label="Etapa următoare"
                className="flex min-h-11 touch-manipulation items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-semibold text-brand transition-colors enabled:active:bg-sunken disabled:cursor-not-allowed disabled:opacity-35"
              >
                Următoarea
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-7 gap-1" aria-hidden>
              {flow.steps.map((step, index) => (
                <span
                  key={step.id}
                  className={cn(
                    "h-1 rounded-full",
                    index <= activeIndex ? "bg-brand" : "bg-line-strong",
                  )}
                />
              ))}
            </div>
          </div>

          <ol
            className="relative hidden grid-cols-7 bg-subtle lg:grid"
            aria-label="Etapele informației în Sarbato"
          >
            {flow.steps.map((step, index) => {
              const selected = step.id === active.id;
              const Icon = icons[step.id];

              return (
                <li
                  key={step.id}
                  className="relative min-w-[9rem] snap-start border-r border-line last:border-r-0 lg:col-span-1 lg:min-w-0 lg:border-r lg:border-b-0 lg:last:border-r-0"
                >
                  <button
                    type="button"
                    onClick={() => setActiveId(step.id)}
                    aria-pressed={selected}
                    className={cn(
                      "group flex min-h-18 w-full touch-manipulation items-center gap-3 bg-surface px-3 py-2.5 text-left transition-colors duration-200 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-brand lg:min-h-28 lg:flex-col lg:items-start lg:justify-between lg:px-3 lg:py-4",
                      selected ? "bg-brand text-on-brand" : "hover:bg-subtle",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-xl",
                        selected ? "bg-on-brand text-brand" : stageTones[index],
                      )}
                    >
                      <Icon className="size-4" strokeWidth={1.9} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 lg:flex lg:flex-col lg:justify-end">
                      <span
                        className={cn(
                          "block text-xs font-semibold uppercase tracking-[0.08em]",
                          selected ? "text-white/65" : "text-faint",
                        )}
                      >
                        Etapa {index + 1}
                      </span>
                      <span className="mt-1 block text-sm font-semibold leading-5">
                        {step.label}
                      </span>
                      <span
                        className={cn(
                          "mt-1 hidden text-xs leading-4 lg:block",
                          selected ? "text-white/75" : "text-muted",
                        )}
                      >
                        {step.trigger}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="grid min-w-0 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="border-b border-line p-4 sm:p-8 lg:border-r lg:border-b-0 lg:p-10">
              <div className="flex items-center gap-3">
                <span className={cn("h-1 w-12 rounded-full", stageTones[activeIndex].split(" ")[0])} />
                <p className="text-sm font-semibold text-accent-strong">
                  {active.trigger}
                </p>
              </div>
              <h3
                className="marketing-heading mt-2.5 max-w-[20ch] text-[clamp(1.75rem,8vw,2.125rem)] font-semibold leading-[1.06] tracking-[-0.025em] text-brand text-balance sm:mt-4 sm:text-[clamp(2rem,3vw,3rem)] sm:leading-[1.04] sm:tracking-[-0.03em]"
                aria-live="polite"
              >
                {active.title}
              </h3>
              <p className="mt-3 max-w-[50ch] text-base leading-6 text-muted sm:mt-5 sm:leading-7">
                {active.description}
              </p>
              <div className="mt-4 flex items-start gap-3 border-t border-line pt-3.5 text-sm font-semibold leading-6 text-success sm:mt-7 sm:pt-5">
                <ArrowRight className="mt-1 size-4 shrink-0" aria-hidden />
                <span>{active.next}</span>
              </div>
            </div>

            <div className="marketing-product-surface-flat p-4 sm:p-8 lg:p-10">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-semibold text-muted">
                  Devine disponibil în produs
                </p>
                <span className="text-xs font-semibold text-faint tabular-nums">
                  {String(activeIndex + 1).padStart(2, "0")} / 07
                </span>
              </div>
              <ul
                className="mt-3 divide-y divide-line border-y border-line sm:mt-5"
                aria-label="Rezultatele etapei"
              >
                {active.results.map((result, index) => (
                  <li
                    key={result}
                    className="flex min-h-12 items-center gap-3 py-2.5 sm:min-h-14 sm:gap-4 sm:py-3"
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full",
                        index === 0
                          ? "bg-accent-soft text-accent-strong"
                          : index === 1
                            ? "bg-warning-soft text-warning"
                            : "bg-success-soft text-success",
                      )}
                    >
                      <Check className="size-4" strokeWidth={2.2} aria-hidden />
                    </span>
                    <span className="text-base font-semibold leading-6 text-ink">
                      {result}
                    </span>
                  </li>
                ))}
              </ul>
              <p
                data-testid="showcase-label"
                className="mt-3 text-xs leading-5 text-muted sm:mt-5"
              >
                Exemplu de produs — nu reprezintă datele unui client.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
