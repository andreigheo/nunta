import { ArrowDownRight, LockKeyhole } from "lucide-react";
import { hero, primaryCta, secondaryCta } from "@/content/marketing/sarbato";
import { HeroDashboard } from "./hero-dashboard";
import { CtaLink } from "./section";

export function Hero() {
  const titleStart = hero.title.slice(0, -hero.highlight.length).trim();

  return (
    <section
      className="marketing-hero relative overflow-hidden"
      aria-labelledby="landing-title"
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <span className="absolute -left-20 top-20 size-56 rounded-full bg-accent-soft blur-3xl" />
        <span className="absolute -right-24 top-4 size-72 rounded-full bg-warning-soft blur-3xl" />
      </div>

      <div className="relative mx-auto grid w-full max-w-[90rem] gap-6 px-4 pb-10 pt-7 sm:gap-9 sm:px-8 sm:pb-16 sm:pt-12 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:items-center lg:gap-10 lg:px-10 lg:pb-20 lg:pt-16 xl:px-12">
        <div className="min-w-0 max-w-[40rem]">
          <p className="mkt-rise inline-flex max-w-full items-center gap-2 rounded-full bg-brand-softer px-3 py-2 text-xs font-semibold leading-5 text-brand sm:text-sm">
            <span className="size-2 rounded-full bg-success" aria-hidden />
            {hero.availability}
          </p>

          <h1
            id="landing-title"
            className="marketing-heading mkt-rise mkt-rise-1 mt-5 text-[clamp(2.25rem,9.5vw,2.5rem)] font-semibold leading-[1.03] tracking-[-0.03em] text-brand text-balance sm:mt-6 sm:text-[clamp(3rem,4.25vw,3.75rem)] sm:leading-[1.02] sm:tracking-[-0.035em]"
          >
            {titleStart}{" "}
            <span className="relative inline">
              {hero.highlight}
              <span
                className="absolute -bottom-2 left-0 h-1 w-full rounded-full bg-accent"
                aria-hidden
              />
            </span>
          </h1>

          <p className="mkt-rise mkt-rise-2 mt-5 max-w-[57ch] text-base leading-7 text-ink sm:mt-6 sm:text-lg sm:leading-8">
            {hero.lead}
          </p>

          <div className="mkt-rise mkt-rise-2 mt-6 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3 lg:flex-col lg:items-stretch xl:flex-row xl:items-center">
            <CtaLink
              cta={primaryCta}
              withArrow
              className="w-full sm:w-auto lg:w-full xl:w-auto xl:px-4 xl:text-sm 2xl:px-5 2xl:text-base"
            />
            <CtaLink
              cta={secondaryCta}
              variant="ghost"
              className="w-full sm:w-auto lg:w-full xl:w-auto xl:px-4 xl:text-sm 2xl:px-5 2xl:text-base"
            />
          </div>

          <div className="mkt-rise mkt-rise-2 mt-6 flex max-w-[34rem] items-start gap-3 border-t border-line pt-4 sm:mt-7">
            <LockKeyhole
              className="mt-0.5 size-5 shrink-0 text-success"
              strokeWidth={1.8}
              aria-hidden
            />
            <p className="text-sm leading-6 text-muted">{hero.support}</p>
          </div>
        </div>

        <div className="relative min-w-0">
          <HeroDashboard />
          <div className="absolute -bottom-8 left-4 hidden items-center gap-2 text-sm font-semibold text-brand lg:flex">
            <ArrowDownRight className="size-5 text-accent" aria-hidden />
            Urmărește informația prin produs
          </div>
        </div>
      </div>
    </section>
  );
}
