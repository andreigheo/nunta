"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck2,
  Check,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  ListChecks,
  ShieldCheck,
  UsersRound,
  UtensilsCrossed,
  WalletCards,
} from "lucide-react";
import { CinematicReveal } from "@/components/invitations/cinematic-reveal";
import type { CinematicRevealSettings } from "@/components/invitations/invitation-experience";
import { showcaseStages } from "@/content/marketing/sarbato";
import { cn } from "@/lib/utils";

const heroEnvelopeReveal: CinematicRevealSettings = {
  enabled: true,
  style: "envelope",
  persistenceKey: "sarbato:marketing-hero-envelope",
  recipientLabel: "Invitația ta",
  message: "Toate informațiile importante, într-un singur loc.",
  monogram: "S",
  panelColor: "#3B183F",
  backgroundColor: "#F7F7F3",
  accentColor: "#F06449",
  textColor: "#FFF9FF",
  accentTextColor: "#19151D",
  coverMediaId: "",
  coverImageUrl: "",
  texture: "paper",
  durationMs: 1750,
};

type StageId = (typeof showcaseStages)[number]["id"];

const stageIcons = {
  plan: ClipboardCheck,
  rsvp: UsersRound,
  vendors: WalletCards,
  "event-day": CalendarCheck2,
} satisfies Record<StageId, typeof ClipboardCheck>;

/* The phone mirrors the module a person would open on their own device. */
const phoneAppBarLabels = {
  plan: "Planul nunții",
  rsvp: "Invitație",
  vendors: "Oferte",
  "event-day": "Desfășurător",
} satisfies Record<StageId, string>;

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
      <div className="flex items-center gap-2.5 border-b border-line px-3 py-2.5 sm:px-5 sm:py-3">
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
      </div>

      <div className="grid min-w-0 lg:grid-cols-[11rem_minmax(0,1fr)]">
        <nav
          aria-label="Etapele exemplului de produs"
          className="overflow-hidden border-b border-line bg-brand lg:border-r lg:border-b-0"
        >
          <ul className="grid grid-cols-4 gap-1 p-1.5 lg:grid-cols-1 lg:gap-0 lg:p-3">
            {showcaseStages.map((stage) => {
              const selected = stage.id === activeId;
              const Icon = stageIcons[stage.id];
              return (
                <li key={stage.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => selectStage(stage.id)}
                    aria-pressed={selected}
                    className={cn(
                      "flex min-h-14 w-full touch-manipulation flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-center text-xs font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white lg:min-h-11 lg:flex-row lg:justify-start lg:gap-2 lg:px-2.5 lg:py-2 lg:text-left lg:text-sm",
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
                    <span className="leading-tight lg:hidden">
                      {stage.shortLabel}
                    </span>
                    <span className="hidden leading-tight lg:inline">
                      {stage.navLabel}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0 p-3.5 sm:p-5">
          <div className="grid min-w-0 gap-3 min-[1380px]:grid-cols-[minmax(0,1fr)_13rem] min-[1380px]:gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-muted">
                Următoarea acțiune
              </p>
              <div className="mt-2 bg-subtle p-3 sm:mt-2.5 sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-white sm:size-10">
                    <Check className="size-5" strokeWidth={2.2} aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p
                      className="text-base font-semibold leading-tight text-ink sm:text-lg"
                      aria-live="polite"
                    >
                      {active.action}
                    </p>
                    <p className="mt-1.5 max-w-[48ch] text-sm leading-5 text-muted sm:mt-2 sm:leading-6">
                      {active.detail}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-4">
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

              <div className="mt-2.5 grid grid-cols-1 gap-2 min-[380px]:grid-cols-3 sm:mt-4 sm:gap-3">
                {active.connected.map((item, index) => (
                  <div
                    key={item}
                    className="flex min-h-11 min-w-0 items-center gap-2 border-t border-line pt-2 sm:min-h-14 sm:gap-2.5 sm:pt-3"
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
                    <span className="min-w-0 text-xs font-semibold leading-4 text-ink sm:text-sm sm:leading-5">
                      {item}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="hidden min-[1380px]:block">
              <StagePhone stageId={activeId} navLabel={active.navLabel} />
            </div>
          </div>

          <div className="mt-3.5 sm:mt-5">
            <div
              className="marketing-thread h-1 w-full rounded-full"
              aria-hidden
            />
            <ol
              className="mt-3 hidden grid-cols-4 gap-2 sm:grid"
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

      <p
        data-testid="showcase-label"
        className="border-t border-line px-3 py-2 text-xs font-medium leading-4 text-muted sm:px-5"
      >
        Exemplu de produs — nu reprezintă datele unui client.
      </p>
    </section>
  );
}

function StagePhone({
  stageId,
  navLabel,
}: {
  stageId: StageId;
  navLabel: string;
}) {
  return (
    <PhoneShell
      stageId={stageId}
      navLabel={navLabel}
      dark={stageId === "event-day"}
      bleed={stageId === "rsvp"}
    >
      {stageId === "plan" ? <PlanScreen /> : null}
      {stageId === "rsvp" ? (
        <CinematicReveal
          key="hero-envelope-reveal"
          variant="embedded"
          settings={heroEnvelopeReveal}
          shouldAutoReveal
        >
          <InvitationScreen />
        </CinematicReveal>
      ) : null}
      {stageId === "vendors" ? <OffersScreen /> : null}
      {stageId === "event-day" ? <EventDayScreen /> : null}
    </PhoneShell>
  );
}

function PhoneShell({
  stageId,
  navLabel,
  dark = false,
  bleed = false,
  children,
}: {
  stageId: StageId;
  navLabel: string;
  dark?: boolean;
  bleed?: boolean;
  children: React.ReactNode;
}) {
  const Icon = stageIcons[stageId];

  return (
    <div
      role="group"
      aria-label={`Previzualizare mobilă: ${navLabel}`}
      data-hero-phone-stage={stageId}
      className="mx-auto w-full max-w-[13rem] rounded-[18px] bg-ink p-1.5 shadow-pop"
    >
      {/* 18px bezel minus 6px padding keeps the screen corners concentric. */}
      <div
        className={cn(
          "overflow-hidden rounded-[12px]",
          dark ? "bg-brand" : "bg-elevated",
        )}
      >
        {/* Padding, not margin: a collapsing margin would expose the screen
            behind the app bar and break the flush top edge. */}
        <div
          className={cn(
            "px-3 pb-2 pt-1.5",
            dark ? "bg-brand-strong" : "bg-brand",
          )}
        >
          <span
            className="mx-auto block h-1 w-7 rounded-full bg-on-brand/30"
            aria-hidden
          />
          <div className="mt-1.5 flex items-center gap-1.5 text-on-brand">
            <Icon className="size-3.5 shrink-0" strokeWidth={1.9} aria-hidden />
            <span className="min-w-0 truncate text-xs font-semibold leading-4">
              {phoneAppBarLabels[stageId]}
            </span>
          </div>
        </div>

        <div
          key={stageId}
          className={cn(
            "mkt-phone-swap flex min-h-[17.5rem] flex-col",
            bleed ? undefined : "gap-2.5 p-3",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function PhoneChip({
  tone,
  children,
}: {
  tone: "warning" | "accent" | "success";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "self-start rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold leading-4",
        tone === "warning" && "bg-warning-soft text-warning",
        tone === "accent" && "bg-accent-soft text-accent-strong",
        tone === "success" && "bg-success-soft text-success",
      )}
    >
      {children}
    </span>
  );
}

function PhoneAction({
  tone = "brand",
  children,
}: {
  tone?: "brand" | "inverse";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "mt-auto flex min-h-9 items-center justify-center rounded-lg px-2 text-xs font-semibold leading-4",
        tone === "brand" ? "bg-brand text-on-brand" : "bg-elevated text-brand",
      )}
    >
      {children}
    </span>
  );
}

function PlanScreen() {
  const tasks = [
    { title: "Clarifică prioritățile", state: "Finalizat", tone: "done" },
    { title: "Revizuiește dependențele", state: "Blocat", tone: "blocked" },
    { title: "Aprobă etapa următoare", state: "În lucru", tone: "active" },
  ] as const;

  return (
    <>
      <PhoneChip tone="warning">Necesită aprobare</PhoneChip>
      <p className="text-[0.8125rem] font-semibold leading-[1.2] text-ink">
        Etapa în revizuire
      </p>
      <span
        className="flex h-1 overflow-hidden rounded-full bg-sunken"
        aria-hidden
      >
        <span className="w-3/5 rounded-full bg-brand" />
      </span>

      <ul className="space-y-2">
        {tasks.map((task) => (
          <li key={task.title} className="flex items-start gap-2">
            <span
              className={cn(
                "mt-px flex size-4 shrink-0 items-center justify-center rounded-full",
                task.tone === "done" && "bg-success text-on-success",
                task.tone === "blocked" && "bg-warning-soft text-warning",
                task.tone === "active" && "bg-accent text-white",
              )}
            >
              {task.tone === "done" ? (
                <Check className="size-2.5" strokeWidth={3} aria-hidden />
              ) : task.tone === "blocked" ? (
                <AlertTriangle className="size-2.5" aria-hidden />
              ) : (
                <ArrowRight className="size-2.5" strokeWidth={2.6} aria-hidden />
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold leading-4 text-ink">
                {task.title}
              </span>
              <span className="block text-[0.6875rem] leading-4 text-muted">
                {task.state}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <p className="text-[0.6875rem] leading-4 text-muted">
        Organizator · Plan B atașat
      </p>
      <PhoneAction>Aprobă etapa</PhoneAction>
    </>
  );
}

function InvitationScreen() {
  return (
    <article
      data-invitation-renderer
      tabIndex={-1}
      className="relative flex min-h-[17.5rem] flex-col overflow-hidden px-3 py-3.5 outline-none"
      style={{ backgroundColor: "#FFF8EE" }}
    >
      <span
        className="pointer-events-none absolute inset-0 opacity-40"
        aria-hidden
        style={{
          background:
            "radial-gradient(circle at 18% 12%, rgb(240 100 73 / 14%), transparent 24%), linear-gradient(120deg, transparent 45%, rgb(59 24 63 / 7%) 46%, transparent 48%)",
        }}
      />

      <div className="relative flex flex-1 flex-col items-center justify-center text-center">
        <span
          className="flex size-11 items-center justify-center rounded-full border border-accent bg-white/40 text-base font-semibold text-brand"
          style={{ fontFamily: "var(--font-display)" }}
        >
          S
        </span>
        <p className="mt-2.5 text-[0.6875rem] font-semibold uppercase leading-4 tracking-[0.16em] text-accent-strong">
          Ești invitat
        </p>
        <p
          className="mt-1 text-base font-semibold leading-5 tracking-[-0.02em] text-brand"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Evenimentul nostru
        </p>
        <span className="mt-2 block h-px w-8 bg-accent" aria-hidden />
      </div>

      {/* The paper keeps the creative type; the RSVP controls stay operational. */}
      <div className="relative mt-3 border-t border-dashed border-ink/20 pt-2.5">
        <div className="grid grid-cols-2 gap-1.5">
          <span className="flex min-h-8 items-center justify-center gap-1 rounded-lg bg-success-soft px-1.5 text-[0.6875rem] font-semibold leading-4 text-success">
            <Check className="size-3 shrink-0" strokeWidth={3} aria-hidden />
            Particip
          </span>
          <span className="flex min-h-8 items-center justify-center rounded-lg bg-white/45 px-1.5 text-[0.6875rem] font-semibold leading-4 text-muted">
            Încă nu știu
          </span>
        </div>
        <div className="mt-1.5 flex min-h-8 items-center gap-1.5 border-y border-ink/10 px-1">
          <UtensilsCrossed className="size-3 shrink-0 text-brand" aria-hidden />
          <span className="text-[0.6875rem] font-medium leading-4 text-muted">
            Meniu
          </span>
          <span className="ml-auto text-[0.6875rem] font-semibold leading-4 text-ink">
            Ales
          </span>
        </div>
        <span className="mt-1.5 flex min-h-9 items-center justify-center rounded-lg bg-brand px-2 text-xs font-semibold leading-4 text-on-brand">
          Salvează RSVP
        </span>
      </div>
    </article>
  );
}

function OffersScreen() {
  const offers = [
    {
      label: "Ofertă anterioară",
      state: "Cerințe parțiale",
      revised: false,
    },
    {
      label: "Ofertă revizuită",
      state: "Cerințe aliniate",
      revised: true,
    },
  ] as const;

  return (
    <>
      <PhoneChip tone="warning">Decizie necesară</PhoneChip>
      <p className="text-[0.8125rem] font-semibold leading-[1.2] text-ink">
        Comparație oferte
      </p>

      <ul className="space-y-1.5">
        {offers.map((offer) => (
          <li
            key={offer.label}
            className={cn(
              "rounded-lg px-2 py-1.5",
              offer.revised
                ? "border border-brand-soft bg-brand-softer"
                : "bg-subtle",
            )}
          >
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  offer.revised ? "bg-accent" : "bg-line-strong",
                )}
                aria-hidden
              />
              <span className="min-w-0 truncate text-xs font-semibold leading-4 text-ink">
                {offer.label}
              </span>
            </span>
            <span className="mt-0.5 block text-[0.6875rem] leading-4 text-muted">
              {offer.state}
            </span>
          </li>
        ))}
      </ul>

      <p className="text-[0.6875rem] leading-4 text-muted">
        Versiune păstrată pentru comparație
      </p>
      <p className="flex items-center gap-1.5 text-[0.6875rem] font-medium leading-4 text-muted">
        <FileCheck2 className="size-3 shrink-0 text-brand" aria-hidden />
        Contract după acceptare
      </p>
      <PhoneAction>Păstrează decizia</PhoneAction>
    </>
  );
}

function EventDayScreen() {
  return (
    <>
      <div className="rounded-lg bg-white/10 px-2 py-1.5">
        <p className="text-[0.6875rem] font-semibold uppercase leading-4 tracking-[0.14em] text-warning-soft">
          Acum
        </p>
        <p className="mt-0.5 text-[0.8125rem] font-semibold leading-[1.2] text-white">
          Moment în desfășurare
        </p>
        <span
          className="mt-2 flex h-1 overflow-hidden rounded-full bg-white/20"
          aria-hidden
        >
          <span className="w-2/3 rounded-full bg-accent" />
        </span>
      </div>

      <div className="rounded-lg bg-elevated px-2 py-1.5">
        <p className="text-[0.6875rem] font-semibold uppercase leading-4 tracking-[0.14em] text-accent-strong">
          Urmează
        </p>
        <p className="mt-0.5 text-[0.8125rem] font-semibold leading-[1.2] text-brand">
          Pregătește tranziția
        </p>
      </div>

      <div className="mt-auto flex flex-col gap-1.5">
        <p className="flex items-center gap-1.5 text-[0.6875rem] font-medium leading-4 text-on-brand/85">
          <CheckCircle2
            className="size-3 shrink-0 text-success-soft"
            aria-hidden
          />
          Plan B confirmat
        </p>
        <p className="flex items-center gap-1.5 text-[0.6875rem] font-medium leading-4 text-on-brand/85">
          <ListChecks className="size-3 shrink-0 text-sun-soft" aria-hidden />
          Checklist deschis
        </p>
        <PhoneAction tone="inverse">Continuă desfășurătorul</PhoneAction>
      </div>
    </>
  );
}
