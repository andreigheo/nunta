import { ArrowRight, CheckCircle2 } from "lucide-react";
import { finalCta, primaryCta, signInCta } from "@/content/marketing/sarbato";
import { CtaLink, Section } from "./section";

export function FinalCta() {
  return (
    <Section spacing="compact" className="bg-background">
      <div className="relative overflow-hidden bg-brand px-5 py-10 text-on-brand sm:px-12 sm:py-18 lg:px-16 lg:py-20">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-1.5 marketing-thread"
          aria-hidden
        />
        <span
          className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-accent blur-3xl"
          aria-hidden
        />
        <span
          className="pointer-events-none absolute -bottom-24 left-[45%] size-64 rounded-full bg-success blur-3xl"
          aria-hidden
        />

        <div className="relative mx-auto max-w-[58rem] text-center">
          <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-white/10 sm:size-12">
            <CheckCircle2 className="size-6 text-warning-soft" aria-hidden />
          </div>
          <h2 className="marketing-heading mt-5 text-[clamp(2.25rem,10.5vw,2.75rem)] font-semibold leading-[1.04] tracking-[-0.03em] text-on-brand text-balance sm:mt-6 sm:text-[clamp(2.5rem,4vw,3.5rem)] sm:leading-[1.02] sm:tracking-[-0.035em]">
            {finalCta.title}
          </h2>
          <p className="mx-auto mt-4 max-w-[58ch] text-[1.0625rem] leading-7 text-on-brand sm:mt-6 sm:text-lg sm:leading-8">
            {finalCta.text}
          </p>
          <ul className="mt-5 flex flex-col items-start justify-center gap-2.5 text-left text-sm font-semibold text-white/80 min-[520px]:items-center min-[520px]:text-center sm:mt-7 sm:flex-row sm:flex-wrap sm:gap-x-6">
            {finalCta.assurances.map((assurance) => (
              <li key={assurance} className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-success-soft" aria-hidden />
                {assurance}
              </li>
            ))}
          </ul>
          <div className="mt-7 flex flex-col justify-center gap-2.5 min-[520px]:flex-row min-[520px]:items-center sm:mt-9 sm:gap-3">
            <CtaLink
              cta={primaryCta}
              withArrow
              variant="outline"
              className="w-full border-transparent bg-elevated text-brand hover:bg-surface min-[520px]:w-auto"
            />
            <CtaLink
              cta={signInCta}
              variant="ghost"
              className="w-full text-on-brand hover:bg-white/10 hover:text-white min-[520px]:w-auto"
            />
          </div>
          <p className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-white/75">
            Intri direct în fluxul real de cont.
            <ArrowRight className="size-4" aria-hidden />
          </p>
        </div>
      </div>
    </Section>
  );
}
