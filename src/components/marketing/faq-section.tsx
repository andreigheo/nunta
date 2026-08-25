import { ChevronDown } from "lucide-react";
import { faqs } from "@/content/marketing/sarbato";
import { Section, SectionHeading } from "./section";

export function FaqSection() {
  return (
    <Section id="intrebari" spacing="major">
      <SectionHeading
        title="Întrebări înainte să începi"
        lead="Invitați, acces, abonamente, date și plăți către furnizori."
        className="mx-auto text-center"
      />
      <div className="mx-auto mt-8 max-w-4xl divide-y divide-line border-y border-line sm:mt-12">
        {faqs.map((item) => (
          <details key={item.q} className="group">
            <summary className="flex min-h-16 cursor-pointer touch-manipulation list-none items-center justify-between gap-4 py-4 text-left text-base font-semibold leading-6 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden sm:gap-5 sm:py-5 sm:text-xl sm:leading-7">
              <span>{item.q}</span>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-subtle text-brand transition-colors duration-200 group-open:bg-brand group-open:text-on-brand sm:size-10">
                <ChevronDown
                  className="size-5 transition-transform duration-200 group-open:rotate-180"
                  aria-hidden
                />
              </span>
            </summary>
            <p className="max-w-[68ch] pb-6 pr-3 text-base leading-7 text-muted sm:pb-7 sm:pr-12">
              {item.a}
            </p>
          </details>
        ))}
      </div>
    </Section>
  );
}
