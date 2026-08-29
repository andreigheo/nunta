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

      <div className="relative mx-auto grid w-full max-w-[90rem] gap-12 px-5 pb-20 pt-16 sm:px-8 sm:pb-24 sm:pt-20 lg:grid-cols-[minmax(21rem,0.82fr)_minmax(36rem,1.18fr)] lg:items-center lg:gap-12 lg:px-10 lg:pb-28 lg:pt-24 xl:px-12">
        <div className="max-w-[40rem]">
          <p className="mkt-rise inline-flex items-center gap-2 rounded-full bg-brand-softer px-3 py-2 text-sm font-semibold text-brand">
            <span className="size-2 rounded-full bg-success" aria-hidden />
            {hero.availability}
          </p>

          <h1
            id="landing-title"
            className="marketing-heading mkt-rise mkt-rise-1 mt-7 text-[clamp(3rem,4.25vw,3.75rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-brand text-balance"
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

          <p className="mkt-rise mkt-rise-2 mt-8 max-w-[57ch] text-lg leading-8 text-ink">
            {hero.lead}
          </p>

          <div className="mkt-rise mkt-rise-2 mt-9 flex flex-col gap-3 min-[430px]:flex-row min-[430px]:items-center">
            <CtaLink
              cta={primaryCta}
              withArrow
              className="w-full min-[430px]:w-auto"
            />
            <CtaLink
              cta={secondaryCta}
              variant="ghost"
              className="w-full min-[430px]:w-auto"
            />
          </div>

          <div className="mkt-rise mkt-rise-2 mt-8 flex max-w-[34rem] items-start gap-3 border-t border-line pt-5">
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
