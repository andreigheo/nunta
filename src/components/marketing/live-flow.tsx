"use client";

import * as React from "react";
import {
  Armchair,
  ArrowRight,
  CalendarCheck2,
  Check,
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

  return (
    <section
      id="flux"
      className="border-y border-line bg-elevated py-20 sm:py-24 lg:py-28"
      aria-labelledby="flow-title"
    >
      <div className="mx-auto w-full max-w-[90rem] px-5 sm:px-8 lg:px-10 xl:px-12">
        <div className="grid gap-7 lg:grid-cols-[minmax(18rem,0.72fr)_minmax(31rem,1.28fr)] lg:items-end lg:gap-16">
          <div>
            <p className="text-sm font-semibold text-accent-strong">
              Cum funcționează Sarbato
            </p>
            <h2
              id="flow-title"
              className="marketing-heading mt-4 max-w-[18ch] text-[clamp(2.5rem,4vw,3.5rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-ink text-balance"
            >
              {flow.title}
            </h2>
          </div>
          <p className="max-w-[62ch] text-lg leading-8 text-muted">
            {flow.lead}
          </p>
        </div>

        <div className="mt-12 border border-line bg-surface sm:mt-14">
          <div className="border-b border-line px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-ink">
                Firul complet al evenimentului
              </p>
              <p className="text-xs leading-5 text-muted">
                Alege o etapă pentru a vedea ce preia și ce predă mai departe.
              </p>
            </div>
          </div>

          <ol
            className="relative grid grid-cols-1 bg-subtle min-[380px]:grid-cols-2 lg:grid-cols-7"
            aria-label="Etapele informației în Sarbato"
          >
            {flow.steps.map((step, index) => {
              const selected = step.id === active.id;
              const Icon = icons[step.id];

              return (
                <li
                  key={step.id}
                  className="relative border-b border-line last:border-b-0 min-[380px]:odd:border-r min-[380px]:last:col-span-2 min-[380px]:last:border-r-0 lg:col-span-1 lg:border-r lg:border-b-0 lg:last:col-span-1 lg:last:border-r-0"
                >
                  <button
                    type="button"
                    onClick={() => setActiveId(step.id)}
                    aria-pressed={selected}
                    className={cn(
                      "group flex min-h-20 w-full items-center gap-3 bg-surface px-4 py-3 text-left transition-colors duration-200 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-brand lg:min-h-32 lg:flex-col lg:items-start lg:justify-between lg:px-3 lg:py-4",
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
            <div className="border-b border-line p-6 sm:p-8 lg:border-r lg:border-b-0 lg:p-10">
              <div className="flex items-center gap-3">
                <span className={cn("h-1 w-12 rounded-full", stageTones[activeIndex].split(" ")[0])} />
                <p className="text-sm font-semibold text-accent-strong">
                  {active.trigger}
                </p>
              </div>
              <h3
                className="marketing-heading mt-4 max-w-[20ch] text-[clamp(2rem,3vw,3rem)] font-semibold leading-[1.04] tracking-[-0.03em] text-brand text-balance"
                aria-live="polite"
              >
                {active.title}
              </h3>
              <p className="mt-5 max-w-[50ch] text-base leading-7 text-muted">
                {active.description}
              </p>
              <div className="mt-7 flex items-start gap-3 border-t border-line pt-5 text-sm font-semibold leading-6 text-success">
                <ArrowRight className="mt-1 size-4 shrink-0" aria-hidden />
                <span>{active.next}</span>
              </div>
            </div>

            <div className="marketing-product-surface-flat p-6 sm:p-8 lg:p-10">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-semibold text-muted">
                  Devine disponibil în produs
                </p>
                <span className="text-xs font-semibold text-faint tabular-nums">
                  {String(activeIndex + 1).padStart(2, "0")} / 07
                </span>
              </div>
              <ul
                className="mt-5 divide-y divide-line border-y border-line"
                aria-label="Rezultatele etapei"
              >
                {active.results.map((result, index) => (
                  <li
                    key={result}
                    className="flex min-h-14 items-center gap-4 py-3"
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
                className="mt-5 text-xs leading-5 text-muted"
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
