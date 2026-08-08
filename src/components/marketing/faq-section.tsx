import { ChevronDown } from "lucide-react";
import { faqs } from "@/content/marketing/sarbato";
import { Section, SectionHeading } from "./section";

export function FaqSection() {
  return (
    <Section id="intrebari" spacing="major">
      <SectionHeading
        title="Întrebări înainte să începi"
        lead="Răspunsuri directe despre invitați, acces, abonamente, date și plățile către furnizori."
        className="mx-auto text-center"
      />
      <div className="mx-auto mt-12 max-w-4xl divide-y divide-line border-y border-line">
        {faqs.map((item) => (
          <details key={item.q} className="group">
            <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-5 py-5 text-left text-lg font-semibold leading-7 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden sm:text-xl">
              <span>{item.q}</span>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-subtle text-brand transition-colors duration-200 group-open:bg-brand group-open:text-on-brand">
                <ChevronDown
                  className="size-5 transition-transform duration-200 group-open:rotate-180"
                  aria-hidden
                />
              </span>
            </summary>
            <p className="max-w-[68ch] pb-7 pr-12 text-base leading-7 text-muted">
              {item.a}
            </p>
          </details>
        ))}
      </div>
    </Section>
  );
}
