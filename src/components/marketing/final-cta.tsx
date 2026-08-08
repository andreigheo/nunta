import { ArrowRight, CheckCircle2 } from "lucide-react";
import { finalCta, primaryCta, signInCta } from "@/content/marketing/sarbato";
import { CtaLink, Section } from "./section";

export function FinalCta() {
  return (
    <Section spacing="compact" className="bg-background">
      <div className="relative overflow-hidden bg-brand px-6 py-14 text-on-brand sm:px-12 sm:py-18 lg:px-16 lg:py-20">
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
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-white/10">
            <CheckCircle2 className="size-6 text-warning-soft" aria-hidden />
          </div>
          <h2 className="marketing-heading mt-6 text-[clamp(2.7rem,5vw,5.4rem)] font-semibold leading-[0.98] tracking-[-0.04em] text-on-brand text-balance">
            {finalCta.title}
          </h2>
          <p className="mx-auto mt-6 max-w-[58ch] text-lg leading-8 text-on-brand">
            {finalCta.text}
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 min-[430px]:flex-row min-[430px]:items-center">
            <CtaLink
              cta={primaryCta}
              withArrow
              variant="outline"
              className="w-full border-transparent bg-elevated text-brand hover:bg-surface min-[430px]:w-auto"
            />
            <CtaLink
              cta={signInCta}
              variant="ghost"
              className="w-full text-on-brand hover:bg-white/10 hover:text-white min-[430px]:w-auto"
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
