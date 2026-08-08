import { ArrowRight, Check, LockKeyhole } from "lucide-react";
import { pricing } from "@/content/marketing/sarbato";
import { CtaLink } from "./section";

export function PricingSection() {
  return (
    <section
      id="abonamente"
      className="bg-elevated py-20 sm:py-24 lg:py-28"
      aria-labelledby="pricing-title"
    >
      <div className="mx-auto w-full max-w-[90rem] px-5 sm:px-8 lg:px-10 xl:px-12">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(30rem,1.2fr)] lg:items-end lg:gap-16">
          <div>
            <p className="text-sm font-semibold text-accent-strong">
              Abonamente Sarbato
            </p>
            <h2
              id="pricing-title"
              className="marketing-heading mt-4 max-w-[17ch] text-[clamp(2.5rem,4vw,3.5rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-brand text-balance"
            >
              {pricing.title}
            </h2>
          </div>
          <div>
            <p className="max-w-[58ch] text-lg leading-8 text-muted">
              {pricing.lead}
            </p>
            <p className="mt-4 flex items-start gap-2 text-sm leading-6 text-ink">
              <LockKeyhole
                className="mt-0.5 size-4 shrink-0 text-success"
                aria-hidden
              />
              {pricing.boundary}
            </p>
          </div>
        </div>

        <div className="mt-14 grid gap-4 lg:grid-cols-3">
          {pricing.plans.map((plan) => (
            <article
              key={plan.name}
              className={
                plan.featured
                  ? "relative flex min-h-[22rem] min-w-0 flex-col bg-brand p-6 text-on-brand sm:p-8"
                  : "relative flex min-h-[22rem] min-w-0 flex-col border border-line bg-surface p-6 text-ink sm:p-8"
              }
            >
              <div className="flex items-start justify-between gap-4">
                <h3 className="marketing-heading text-2xl font-semibold">
                  {plan.name}
                </h3>
                <span
                  className={
                    plan.featured
                      ? "rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white"
                      : plan.status === "Disponibil"
                        ? "rounded-full bg-success-soft px-3 py-1.5 text-xs font-semibold text-success"
                        : "rounded-full bg-subtle px-3 py-1.5 text-xs font-semibold text-muted"
                  }
                >
                  {plan.status}
                </span>
              </div>

              <div className="mt-8 flex items-end gap-2">
                <p className="marketing-heading text-[clamp(3rem,4vw,4.5rem)] font-semibold leading-none tracking-[-0.04em]">
                  {plan.price}
                </p>
                <p
                  className={
                    plan.featured
                      ? "pb-2 text-sm text-white/70"
                      : "pb-2 text-sm text-muted"
                  }
                >
                  {plan.cadence}
                </p>
              </div>

              <p
                className={
                  plan.featured
                    ? "mt-6 max-w-[34ch] text-base leading-7 text-white/80"
                    : "mt-6 max-w-[34ch] text-base leading-7 text-muted"
                }
              >
                {plan.description}
              </p>

              <ul
                className={
                  plan.featured
                    ? "mt-7 space-y-3 border-t border-white/15 pt-6 text-sm leading-6 text-white/85"
                    : "mt-7 space-y-3 border-t border-line pt-6 text-sm leading-6 text-ink"
                }
              >
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <span
                      className={
                        plan.featured
                          ? "mt-1 flex size-4 shrink-0 items-center justify-center rounded-full bg-white/12"
                          : "mt-1 flex size-4 shrink-0 items-center justify-center rounded-full bg-success-soft"
                      }
                    >
                      <Check
                        className={
                          plan.featured
                            ? "size-2.5 text-white"
                            : "size-2.5 text-success"
                        }
                        strokeWidth={3}
                        aria-hidden
                      />
                    </span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-8">
                <CtaLink
                  cta={plan.cta}
                  withArrow
                  variant={plan.featured ? "outline" : "primary"}
                  className={
                    plan.featured
                      ? "w-full whitespace-normal border-white/20 bg-elevated px-3 text-center text-brand hover:bg-surface"
                      : "w-full whitespace-normal px-3 text-center"
                  }
                />
              </div>
            </article>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
          <p className="flex items-center gap-2 text-sm font-medium text-muted">
            <Check className="size-4 text-success" aria-hidden />
            {pricing.checkoutNote}
          </p>
          <a
            href="#intrebari"
            className="inline-flex min-h-11 max-w-full items-center gap-2 text-sm font-semibold text-brand hover:underline hover:underline-offset-4"
          >
            <span>Vezi întrebările despre abonamente</span>
            <ArrowRight className="size-4 shrink-0" aria-hidden />
          </a>
        </div>
      </div>
    </section>
  );
}
