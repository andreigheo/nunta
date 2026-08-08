"use client";

import * as React from "react";
import {
  ArrowRight,
  CalendarCheck2,
  Check,
  ClipboardCheck,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { flow } from "@/content/marketing/sarbato";
import { cn } from "@/lib/utils";

type FlowId = (typeof flow.steps)[number]["id"];

const icons = {
  plan: ClipboardCheck,
  rsvp: UsersRound,
  vendors: WalletCards,
  "event-day": CalendarCheck2,
} satisfies Record<FlowId, typeof ClipboardCheck>;

export function LiveFlow() {
  const [activeId, setActiveId] = React.useState<FlowId>(flow.steps[0].id);
  const active =
    flow.steps.find((step) => step.id === activeId) ?? flow.steps[0];

  return (
    <section
      id="flux"
      className="border-y border-line bg-elevated py-20 sm:py-24 lg:py-28"
      aria-labelledby="flow-title"
    >
      <div className="mx-auto w-full max-w-[90rem] px-5 sm:px-8 lg:px-10 xl:px-12">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.76fr)_minmax(31rem,1.24fr)] lg:items-end lg:gap-16">
          <div>
            <p className="text-sm font-semibold text-accent-strong">
              Un flux care poate fi urmărit
            </p>
            <h2
              id="flow-title"
              className="marketing-heading mt-4 max-w-[16ch] text-[clamp(2.6rem,4.6vw,4.8rem)] font-semibold leading-[0.98] tracking-[-0.04em] text-ink text-balance"
            >
              {flow.title}
            </h2>
          </div>
          <p className="max-w-[56ch] text-lg leading-8 text-muted">
            {flow.lead}
          </p>
        </div>

        <div className="mt-14 overflow-hidden border border-line bg-surface">
          <ol
            className="relative grid grid-cols-2 border-b border-line lg:grid-cols-4"
            aria-label="Etapele informației în Sarbato"
          >
            {flow.steps.map((step, index) => {
              const selected = step.id === activeId;
              const Icon = icons[step.id];

              return (
                <li
                  key={step.id}
                  className="relative border-b border-line even:border-l lg:border-b-0 lg:border-l lg:first:border-l-0"
                >
                  <button
                    type="button"
                    onClick={() => setActiveId(step.id)}
                    aria-pressed={selected}
                    className={cn(
                      "group flex min-h-28 w-full items-start gap-3 px-4 py-5 text-left transition-colors duration-200 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-brand sm:px-5",
                      selected
                        ? "bg-brand text-on-brand"
                        : "bg-surface text-ink hover:bg-subtle",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-xl",
                        selected
                          ? "bg-on-brand text-brand"
                          : index === 1
                            ? "bg-accent-soft text-accent-strong"
                            : index === 2
                              ? "bg-warning-soft text-warning"
                              : index === 3
                                ? "bg-success-soft text-success"
                                : "bg-brand-softer text-brand",
                      )}
                    >
                      <Icon className="size-5" strokeWidth={1.8} aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold leading-5">
                        {step.label}
                      </span>
                      <span
                        className={cn(
                          "mt-2 block text-xs leading-5",
                          selected ? "text-on-brand" : "text-muted",
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

          <div className="grid min-w-0 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
            <div className="border-b border-line p-6 sm:p-8 lg:border-r lg:border-b-0 lg:p-10">
              <p className="text-sm font-semibold text-accent-strong">
                {active.trigger}
              </p>
              <h3
                className="marketing-heading mt-3 text-[clamp(2rem,3vw,3.25rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-brand text-balance"
                aria-live="polite"
              >
                {active.title}
              </h3>
              <p className="mt-5 max-w-[48ch] text-base leading-7 text-muted">
                {active.description}
              </p>
              <div className="mt-7 flex items-center gap-2 text-sm font-semibold text-success">
                <ArrowRight className="size-4" aria-hidden />
                {active.next}
              </div>
            </div>

            <div className="marketing-product-surface-flat p-6 sm:p-8 lg:p-10">
              <p className="text-sm font-semibold text-muted">
                Această informație devine utilă în:
              </p>
              <ul
                className="mt-5 divide-y divide-line"
                aria-label="Rezultatele etapei"
              >
                {active.results.map((result, index) => (
                  <li
                    key={result}
                    className="flex min-h-16 items-center gap-4 py-3"
                  >
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-full",
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
