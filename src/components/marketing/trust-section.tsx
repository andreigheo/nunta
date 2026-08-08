import { CreditCard, Eye, KeyRound, ShieldCheck } from "lucide-react";
import { trust } from "@/content/marketing/sarbato";
import { Section, SectionHeading } from "./section";

const icons = [KeyRound, Eye, ShieldCheck, CreditCard] as const;

export function TrustSection() {
  return (
    <Section
      id="incredere"
      spacing="major"
      className="border-y border-line bg-brand-softer"
    >
      <div className="grid gap-8 sm:gap-12 lg:grid-cols-[minmax(0,0.82fr)_minmax(30rem,1.18fr)] lg:items-start lg:gap-20">
        <SectionHeading title={trust.title} lead={trust.lead} />
        <ul className="divide-y divide-line-strong border-y border-line-strong">
          {trust.principles.map(({ audience, title, description }, index) => {
            const Icon = icons[index];
            return (
              <li key={title} className="flex gap-4 py-5 sm:gap-5 sm:py-7">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-elevated text-brand sm:size-11">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-accent-strong">
                    {audience}
                  </p>
                  <h3 className="marketing-heading mt-1 text-xl font-semibold leading-tight text-ink">
                    {title}
                  </h3>
                  <p className="mt-2 max-w-[48ch] text-base leading-7 text-muted">
                    {description}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Section>
  );
}
