"use client";

import * as React from "react";
import {
  CalendarCheck2,
  Check,
  ClipboardCheck,
  FileCheck2,
  MailCheck,
  ShieldCheck,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { showcaseStages } from "@/content/marketing/sarbato";
import { cn } from "@/lib/utils";

type StageId = (typeof showcaseStages)[number]["id"];

const stageIcons = {
  plan: ClipboardCheck,
  rsvp: UsersRound,
  vendors: WalletCards,
  "event-day": CalendarCheck2,
} satisfies Record<StageId, typeof ClipboardCheck>;

export function HeroDashboard() {
  const [activeId, setActiveId] = React.useState<StageId>(showcaseStages[0].id);
  const active =
    showcaseStages.find((stage) => stage.id === activeId) ?? showcaseStages[0];

  function selectStage(stageId: StageId) {
    setActiveId(stageId);
  }

  return (
    <section
      className="marketing-product-surface mkt-product-enter relative min-w-0"
      aria-label="Exemplu de produs Sarbato"
      data-testid="product-showcase"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-on-brand">
            S
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">
              Spațiul evenimentului
            </p>
            <p className="text-xs text-muted">Următorul pas, în context</p>
          </div>
        </div>
        <span
          data-testid="showcase-label"
          className="rounded-full bg-subtle px-3 py-1.5 text-xs font-semibold text-muted"
        >
          Exemplu de produs. Nu reprezintă datele unui client.
        </span>
      </div>

      <div className="grid min-w-0 lg:grid-cols-[11rem_minmax(0,1fr)]">
        <nav
          aria-label="Etapele exemplului de produs"
          className="border-b border-line bg-brand lg:border-r lg:border-b-0"
        >
          <ul className="grid grid-cols-2 p-2 sm:grid-cols-4 lg:grid-cols-1 lg:p-3">
            {showcaseStages.map((stage) => {
              const selected = stage.id === activeId;
              const Icon = stageIcons[stage.id];
              return (
                <li key={stage.id}>
                  <button
                    type="button"
                    onClick={() => selectStage(stage.id)}
                    aria-pressed={selected}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
                      selected
                        ? "bg-elevated text-brand"
                        : "text-on-brand hover:bg-brand-strong",
                    )}
                  >
                    <Icon
                      className="size-4 shrink-0"
                      strokeWidth={1.9}
                      aria-hidden
                    />
                    <span className="leading-tight">{stage.navLabel}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0 p-4 sm:p-5">
          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_11rem]">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-muted">
                Următoarea acțiune
              </p>
              <div className="mt-2.5 bg-subtle p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white">
                    <Check className="size-5" strokeWidth={2.2} aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p
                      className="text-lg font-semibold leading-tight text-ink"
                      aria-live="polite"
                    >
                      {active.action}
                    </p>
                    <p className="mt-2 max-w-[48ch] text-sm leading-6 text-muted">
                      {active.detail}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="inline-flex min-h-9 items-center rounded-lg bg-brand px-3 text-sm font-semibold text-on-brand">
                    {active.next}
                  </span>
                  <span className="inline-flex items-center gap-2 text-sm font-medium text-success">
                    <ShieldCheck className="size-4" aria-hidden />
                    {active.status}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-muted">
                  <span>
                    Responsabil:{" "}
                    <span className="font-semibold text-ink">
                      {active.owner}
                    </span>
                  </span>
                  <span>
                    <span className="font-semibold text-ink">
                      {active.deadline}
                    </span>
                  </span>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {active.connected.map((item, index) => (
                  <div
                    key={item}
                    className="flex min-h-14 items-center gap-2.5 border-t border-line pt-3"
                  >
                    <span
                      className={cn(
                        "size-2.5 shrink-0 rounded-full",
                        index === 0
                          ? "bg-accent"
                          : index === 1
                            ? "bg-warning"
                            : "bg-success",
                      )}
                      aria-hidden
                    />
                    <span className="text-sm font-semibold text-ink">
                      {item}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="hidden xl:block">
              <InvitationPhone />
            </div>
          </div>

          <div className="mt-5">
            <div
              className="marketing-thread h-1 w-full rounded-full"
              aria-hidden
            />
            <ol
              className="mt-3 grid grid-cols-4 gap-2"
              aria-label="Firul etapelor prezentate"
            >
              {showcaseStages.map((stage) => {
                const selected = stage.id === activeId;
                return (
                  <li
                    key={stage.id}
                    aria-current={selected ? "step" : undefined}
                    className={cn(
                      "flex min-h-9 items-center justify-center rounded-lg px-1 text-center text-xs font-semibold",
                      selected
                        ? "bg-brand-softer text-brand"
                        : "text-muted",
                    )}
                  >
                    {stage.shortLabel}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

function InvitationPhone() {
  return (
    <div className="mx-auto w-full max-w-[11rem] overflow-hidden rounded-[16px] bg-ink p-1.5 shadow-pop">
      <div className="overflow-hidden rounded-[11px] bg-elevated">
        <div className="flex items-center justify-between bg-brand px-3 py-2 text-on-brand">
          <span className="text-xs font-semibold">Invitație</span>
          <span className="size-1.5 rounded-full bg-warning" aria-hidden />
        </div>
        <div className="px-3 py-5 text-center">
          <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
            <MailCheck className="size-5" aria-hidden />
          </span>
          <p className="mt-3 text-sm font-semibold text-ink">
            Evenimentul nostru
          </p>
          <p className="mt-1 text-xs leading-5 text-muted">
            Toate informațiile importante, într-un singur loc.
          </p>
          <span className="mt-4 flex min-h-10 items-center justify-center rounded-lg bg-brand px-2 text-xs font-semibold text-on-brand">
            Confirmă participarea
          </span>
          <span className="mt-2 flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-subtle px-2 text-xs font-medium text-muted">
            <FileCheck2 className="size-3.5" aria-hidden />
            Vezi detaliile
          </span>
        </div>
      </div>
    </div>
  );
}
